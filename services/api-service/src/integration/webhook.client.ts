import * as crypto from 'crypto';

export class WebhookClient {
  static async send(url: string, payload: any, secret?: string) {
    console.log(`[WebhookClient] Dispatching webhook to ${url}`);
    
    const bodyStr = JSON.stringify(payload);
    
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("WEBHOOK_SECRET is not configured");
    }

    const signature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
      },
      body: bodyStr
    });

    if (!response.ok) {
      console.error(`[WebhookClient] Failed to send webhook: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to send webhook: ${response.status}`);
    } else {
      console.log(`[WebhookClient] Webhook delivered successfully for eventId: ${payload.eventId}`);
    }
  }
}
