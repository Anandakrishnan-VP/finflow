import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

export function useWebSocket(taskId) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage]       = useState('');
  const [status, setStatus]     = useState('idle'); // idle|connecting|running|complete|failed|disconnected
  const [error, setError]       = useState(null);

  const wsRef             = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer    = useRef(null);
  const statusRef         = useRef('idle'); // avoids stale closure in onclose

  const buildUrl = useCallback(() => {
    // [FIX] Protocol MUST match the page's protocol. A hardcoded 'ws://' fails
    // silently (mixed-content block) behind nginx's HTTPS termination (RULE 12).
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('access_token') || '';
    // nginx location /ws/ proxies straight through with the prefix intact —
    // matches @app.websocket("/ws/analysis/{task_id}") in main.py exactly.
    return `${protocol}//${window.location.host}/ws/analysis/${taskId}?token=${encodeURIComponent(token)}`;
  }, [taskId]);

  const connect = useCallback(() => {
    if (!taskId) return;
    setStatus('connecting');
    statusRef.current = 'connecting';
    const ws = new WebSocket(buildUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      setStatus('running');
      statusRef.current = 'running';
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.progress === -1) {
          setStatus('failed'); statusRef.current = 'failed';
          setError(data.error || 'Analysis failed');
          return;
        }
        setProgress(data.progress ?? 0);
        setStage(data.stage ?? '');
        if (data.progress >= 100) {
          setStatus('complete'); statusRef.current = 'complete';
          ws.close();
        }
      } catch (e) {
        console.error('WebSocket message parse error', e);
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      // RULE 11: close code 1008 = backend rejected the JWT. Retrying won't help —
      // the token is invalid/expired, not the network.
      if (event.code === 1008) {
        setStatus('failed'); statusRef.current = 'failed';
        setError('Authentication failed. Please log in again.');
        return;
      }
      if (statusRef.current === 'complete' || statusRef.current === 'failed') return;
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts.current);
        reconnectAttempts.current += 1;
        setStatus('disconnected'); statusRef.current = 'disconnected';
        reconnectTimer.current = setTimeout(connect, delay);
      } else {
        setStatus('failed'); statusRef.current = 'failed';
        setError('Lost connection to server. Please refresh.');
      }
    };
  }, [taskId, buildUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return { progress, stage, status, error };
}
