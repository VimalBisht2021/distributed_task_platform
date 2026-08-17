import { ProgressService } from "../services/progress.service";
import { EventService } from "../services/event.service";
import * as dns from "dns";
import ivm from "isolated-vm";
import { Parser } from "expr-eval";
import { promisify } from "util";
import * as nodemailer from "nodemailer";

const lookup = promisify(dns.lookup);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const progressService = new ProgressService();
const eventService = new EventService();

// ─── Ethereal email transporter (created once, reused) ──────────────
let etherealTransporter: nodemailer.Transporter | null = null;

async function getEmailTransporter(): Promise<nodemailer.Transporter> {
  if (etherealTransporter) return etherealTransporter;

  // Use real SMTP if configured via environment variables
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log(`[EMAIL] Using real SMTP server: ${process.env.SMTP_HOST}`);
    etherealTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return etherealTransporter;
  }

  // Create a test account on Ethereal (free, no signup needed)
  const testAccount = await nodemailer.createTestAccount();
  console.log(`[EMAIL] Created Ethereal test account: ${testAccount.user}`);

  etherealTransporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return etherealTransporter;
}

// ─── Handler implementations ────────────────────────────────────────

async function handleHTTP(jobId: string, payload: any) {
  const targetUrl = payload?.url ?? payload?.input?.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('HTTP job requires a valid URL in payload');
  }

  const urlObj = new URL(targetUrl);
  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw new Error('SSRF Protection: Only HTTP/HTTPS protocols are allowed');
  }
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(urlObj.hostname)) {
    throw new Error('SSRF Protection: Localhost is not allowed');
  }

  const { address } = await lookup(urlObj.hostname);
  if (address === '127.0.0.1' || address === '::1' || address === '0.0.0.0' ||
      address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) {
    throw new Error('SSRF Protection: Private/local IPs are not allowed');
  }

  await progressService.updateProgress(jobId, 20);

  const method = payload?.method ?? payload?.input?.method ?? 'GET';
  const headers = payload?.headers ?? payload?.input?.headers ?? {};
  const bodyData = payload?.body ?? payload?.input?.body;
  const body = bodyData ? (typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData)) : undefined;

  await progressService.updateProgress(jobId, 40);

  const response = await fetch(targetUrl, { method, headers, body });
  const responseText = await response.text();

  await progressService.updateProgress(jobId, 80);

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = responseText;
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseJson,
  };
}

async function handleCondition(jobId: string, payload: any) {
  const expression = payload?.expression ?? payload?.input?.expression;
  if (!expression || typeof expression !== 'string') {
    throw new Error('CONDITION handler requires an "expression" string in config');
  }

  await progressService.updateProgress(jobId, 30);

  // Build a safe sandbox context from upstream task outputs
  const sandbox: Record<string, any> = {
    input: payload?.input ?? payload ?? {},
    variables: payload?.variables ?? payload?.input?.variables ?? {},
    upstreamOutputs: payload?.upstreamOutputs ?? payload?.input?.upstreamOutputs ?? {},
    previousOutput: payload?.previousOutput ?? payload?.input?.previousOutput ?? {},
    // Flatten upstream outputs so expressions like `statusCode > 200` work
    ...(payload?.upstreamOutputs ?? {}),
    ...(payload?.input?.upstreamOutputs ?? {}),
  };

  await progressService.updateProgress(jobId, 60);

  let result: boolean;
  try {
    // Safely evaluate the expression using an AST parser (expr-eval)
    const parser = new Parser();
    const evalResult = parser.evaluate(expression, sandbox);
    result = Boolean(evalResult);
  } catch (err: any) {
    throw new Error(`CONDITION expression evaluation failed: ${err.message}. Expression: "${expression}"`);
  }

  console.log(`[CONDITION] Expression "${expression}" evaluated to: ${result}`);

  return {
    expression,
    result,
    branch: result ? 'true' : 'false',
  };
}

async function handleEmail(jobId: string, payload: any) {
  const from = payload?.from ?? payload?.input?.from ?? '"Workflow Engine" <workflow@engine.dev>';
  const to = payload?.to ?? payload?.input?.to ?? 'test@example.com';
  const subject = payload?.subject ?? payload?.input?.subject ?? 'Workflow Notification';
  const body = payload?.body ?? payload?.input?.body ?? 'This email was sent by the Workflow Orchestration Engine.';

  await progressService.updateProgress(jobId, 20);

  const transporter = await getEmailTransporter();

  await progressService.updateProgress(jobId, 50);

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
    html: `<div style="font-family: sans-serif; padding: 20px;">
      <h2 style="color: #4F46E5;">📧 Workflow Notification</h2>
      <p>${body}</p>
      <hr style="border: 1px solid #E5E7EB; margin: 20px 0;">
      <p style="color: #9CA3AF; font-size: 12px;">Sent by Workflow Orchestration Engine</p>
    </div>`,
  });

  // Get the Ethereal preview URL — this is a real viewable link!
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[EMAIL] Sent to ${to} — Preview: ${previewUrl}`);

  return {
    messageId: info.messageId,
    to,
    subject,
    accepted: info.accepted,
    previewUrl, // User can open this URL in browser to see the email!
  };
}

async function handleScript(jobId: string, payload: any) {
  const code = payload?.code ?? payload?.input?.code;
  const language = payload?.language ?? payload?.input?.language ?? 'javascript';

  if (!code || typeof code !== 'string') {
    throw new Error('SCRIPT handler requires a "code" string in config');
  }

  if (language !== 'javascript') {
    throw new Error(`SCRIPT handler only supports JavaScript. Got: "${language}"`);
  }

  if (!ivm) {
    throw new Error('CRITICAL: isolated-vm is not available in the worker environment. Security sandbox cannot be established.');
  }

  await progressService.updateProgress(jobId, 20);

  // Build a sandboxed context with console capture
  const logs: string[] = [];
  const sandbox: Record<string, any> = {
    input: payload?.input ?? payload ?? {},
    variables: payload?.variables ?? payload?.input?.variables ?? {},
    upstreamOutputs: payload?.upstreamOutputs ?? payload?.input?.upstreamOutputs ?? {},
    previousOutput: payload?.previousOutput ?? payload?.input?.previousOutput ?? {},
  };

  await progressService.updateProgress(jobId, 50);

  let result: any;
  try {
    // Wrap code in an async IIFE so users can use await
    const wrappedCode = `(async () => { ${code} })()`;

    // Create a new isolate with a strict 128MB memory limit
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    const ivmContext = await isolate.createContext();
    const jail = ivmContext.global;

    await jail.set('global', jail.derefInto());

    // Inject console.log
    const logCallback = new ivm.Reference((...args: any[]) => {
      logs.push(args.join(' '));
    });
    const errorCallback = new ivm.Reference((...args: any[]) => {
      logs.push('[ERROR] ' + args.join(' '));
    });
    
    await ivmContext.evalClosure(`
      global.console = {
        log: function(...args) { $0.applyIgnored(undefined, args, { arguments: { copy: true } }); },
        error: function(...args) { $1.applyIgnored(undefined, args, { arguments: { copy: true } }); },
        warn: function(...args) { $1.applyIgnored(undefined, args, { arguments: { copy: true } }); }
      };
    `, [logCallback, errorCallback], { arguments: { reference: true } });

    // Inject variables
    await jail.set('input', new ivm.ExternalCopy(sandbox.input).copyInto());
    await jail.set('variables', new ivm.ExternalCopy(sandbox.variables).copyInto());
    await jail.set('upstreamOutputs', new ivm.ExternalCopy(sandbox.upstreamOutputs).copyInto());
    await jail.set('previousOutput', new ivm.ExternalCopy(sandbox.previousOutput).copyInto());

    // Execute the script safely
    const script = await isolate.compileScript(wrappedCode, { filename: 'user-script.js' });
    
    // Run the script and await its Promise result (since it's an async IIFE)
    // We use copy: true to ensure any complex objects returned from the sandbox are transferred safely.
    result = await script.run(ivmContext, { timeout: 5000, promise: true, copy: true });

    // Cleanup memory
    script.release();
    ivmContext.release();
    isolate.dispose();
  } catch (err: any) {
    throw new Error(`SCRIPT execution failed: ${err.message}`);
  }

  console.log(`[SCRIPT] Executed successfully. Logs: ${logs.length} lines`);

  return {
    exitCode: 0,
    result: result ?? null,
    stdout: logs.join('\n'),
    logsCount: logs.length,
  };
}

// ─── Main entry point ───────────────────────────────────────────────

export async function processJob(jobId: string, jobType: string, payload?: any) {
  // Normalize handler name: 'core/http' → 'HTTP', 'core/email' → 'EMAIL'
  const normalizedType = jobType.replace(/^core\//, '').toUpperCase();
  console.log(`Executing ${jobId} of type ${jobType} (normalized: ${normalizedType})`);

  let resultPayload = null;

  switch (normalizedType) {
    case 'HTTP':
      resultPayload = await handleHTTP(jobId, payload);
      break;

    case 'CONDITION':
      resultPayload = await handleCondition(jobId, payload);
      break;

    case 'EMAIL':
      resultPayload = await handleEmail(jobId, payload);
      break;

    case 'SCRIPT':
      resultPayload = await handleScript(jobId, payload);
      break;

    case 'AI':
      resultPayload = { text: '[STUB] Mocked AI completion', tokensUsed: 42 };
      break;

    default: {
      // For unrecognized handlers, run a short mock delay and return success
      const delay = payload?.delay ?? (process.env.TEST_PROCESSOR_DELAY ? parseInt(process.env.TEST_PROCESSOR_DELAY) : 2000);
      for (let i = 1; i <= 4; i++) {
        await sleep(delay / 4);
        await progressService.updateProgress(jobId, i * 25);
      }
      resultPayload = { message: `Job ${jobId} completed (handler: ${jobType})` };
      break;
    }
  }

  await progressService.updateProgress(jobId, 100);

  return {
    resultType: "JSON",
    payload: resultPayload,
  };
}