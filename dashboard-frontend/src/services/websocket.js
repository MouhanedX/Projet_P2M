import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

// Use HTTP(S) URL for SockJS endpoint by default (SockJS expects http/https)
const WS_URL = import.meta.env.VITE_WS_URL || '/ws';

class WebSocketService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.subscriptions = new Map();
  }

  connect(onConnected, onError) {
    if (this.client && this.connected) {
      console.log('WebSocket already connected');
      if (onConnected) onConnected();
      return;
    }

    this.client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      debug: (str) => {
       console.log('STOMP:', str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        console.log('WebSocket connected');
        this.connected = true;
        if (onConnected) onConnected();
      },
      onStompError: (frame) => {
        console.error('STOMP error:', frame);
        this.connected = false;
        if (onError) onError(frame);
      },
      onWebSocketClose: () => {
        console.log('WebSocket closed');
        this.connected = false;
        if (onError) onError(new Error('WebSocket closed'));
      },
      onWebSocketError: (event) => {
        console.error('WebSocket transport error:', event);
        this.connected = false;
        if (onError) onError(event);
      }
    });

    this.client.activate();
  }

  disconnect() {
    if (this.client) {
      this.client.deactivate();
      this.connected = false;
      this.subscriptions.clear();
    }
  }

  subscribe(topic, callback) {
    if (!this.client || !this.connected) {
      console.error('WebSocket not connected');
      return null;
    }

    const existing = this.subscriptions.get(topic);
    if (existing) {
      try {
        existing.unsubscribe();
      } catch (error) {
        console.warn(`Failed to unsubscribe existing topic ${topic}:`, error);
      }
      this.subscriptions.delete(topic);
    }

    const subscription = this.client.subscribe(topic, (message) => {
      try {
        const data = JSON.parse(message.body);
        callback(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.subscriptions.set(topic, subscription);
    console.log(`Subscribed to ${topic}`);
    return subscription;
  }

  unsubscribe(topic) {
    const subscription = this.subscriptions.get(topic);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(topic);
      console.log(`Unsubscribed from ${topic}`);
    }
  }

  isConnected() {
    return this.connected;
  }
}

export default new WebSocketService();
