import { useEffect, useState, useRef } from "react";

export function useSSE<T>(url: string) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const urlWithToken = token ? (url.includes('?') ? `${url}&token=${token}` : `${url}?token=${token}`) : url;
    
    const es = new EventSource(urlWithToken);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "ping") return;
        setData((prev) => [parsed, ...prev].slice(0, 500));
      } catch (err) {
        console.error("Failed to parse SSE data", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE error", err);
      setError(new Error("SSE connection error"));
      setIsConnected(false);
    };

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [url]);

  return { data, isConnected, error };
}
