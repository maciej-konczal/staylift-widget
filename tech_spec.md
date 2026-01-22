# Staylift Voice Widget

## Technical Specification & Project Summary

---

## 1. Overview

**Staylift Voice Widget** is an embeddable web component that enables hotels to add AI-powered voice and text chat to their websites. Built with Stencil.js for framework-agnostic compatibility, it integrates with ElevenLabs Conversational AI to provide real-time voice conversations and text messaging.

### Key Value Proposition

- **For Hotels**: Add a virtual concierge to any website with a single script tag
- **For Guests**: Get instant answers via voice or text, 24/7
- **For Staylift**: Sell white-labeled AI concierge solutions to hotels

---

## 2. Features

| Feature | Description |
|---------|-------------|
| **Text Chat** | WebSocket-based messaging, no microphone required |
| **Voice Calls** | WebRTC-based real-time voice conversations |
| **Auto-Connect** | Starts session automatically when user types |
| **Multi-language** | Built-in EN, PL, DE translations (extensible) |
| **Customizable** | Brand colors, name, logo, position |
| **Framework Agnostic** | Works with React, Vue, Angular, vanilla JS |
| **Responsive** | Mobile and desktop optimized |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Hotel Website                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 <staylift-widget>                     │  │
│  │  ┌─────────────┐    ┌─────────────┐                   │  │
│  │  │ staylift-   │    │ staylift-   │                   │  │
│  │  │ widget.tsx  │───▶│ orb.tsx     │                   │  │
│  │  │ (main)      │    │ (animation) │                   │  │
│  │  └──────┬──────┘    └─────────────┘                   │  │
│  └─────────┼─────────────────────────────────────────────┘  │
│            │                                                 │
│            ▼                                                 │
│  ┌─────────────────────┐                                    │
│  │ @elevenlabs/client  │                                    │
│  │ Conversation SDK    │                                    │
│  └──────────┬──────────┘                                    │
└─────────────┼───────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                   ElevenLabs Cloud                          │
│  ┌─────────────────┐    ┌─────────────────┐                 │
│  │ WebSocket API   │    │ WebRTC Server   │                 │
│  │ (text-only)     │    │ (voice + text)  │                 │
│  └─────────────────┘    └─────────────────┘                 │
│                              │                               │
│                              ▼                               │
│                    ┌─────────────────┐                       │
│                    │ AI Agent        │                       │
│                    │ (configured in  │                       │
│                    │  ElevenLabs UI) │                       │
│                    └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Component Framework** | Stencil.js | 4.41.2 | Web Components compiler |
| **Language** | TypeScript | 5.x | Type safety |
| **AI Backend** | ElevenLabs | - | Conversational AI |
| **SDK** | @elevenlabs/client | latest | WebSocket/WebRTC client |
| **Styling** | CSS3 | - | Shadow DOM scoped styles |
| **Build** | Stencil Compiler | - | ESM/CJS output |

### Why Stencil?

1. **Framework Agnostic** - Outputs standard Web Components
2. **Auto Wrappers** - Can generate React/Vue/Angular bindings
3. **JSX Syntax** - Familiar to React developers
4. **Small Bundle** - Only ships what you use (~15kb gzipped)
5. **Shadow DOM** - Styles don't leak to/from host page

---

## 5. Component API

### 5.1 Properties (Attributes)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `agent-id` | string | **required** | ElevenLabs Agent ID |
| `brand-name` | string | "Customer Support" | Display name in header |
| `primary-color` | string | "#6366f1" | Brand color (hex) |
| `background-color` | string | "#18181b" | Background color |
| `text-color` | string | "#ffffff" | Text color |
| `variant` | "floating" \| "inline" | "floating" | Display mode |
| `position` | "bottom-right" \| "bottom-left" \| "top-right" \| "top-left" | "bottom-right" | Floating position |
| `language` | string | "en" | UI language code |
| `auto-expand` | boolean | false | Open on page load |
| `show-branding` | boolean | true | Show "Powered by Staylift" |

### 5.2 Methods

```typescript
interface StayliftWidget {
  // Start a conversation session
  startConversation(textOnly?: boolean): Promise<void>;
  
  // End the current session
  endConversation(): Promise<void>;
  
  // Send a text message
  sendMessage(text: string): Promise<void>;
  
  // Get current connection status
  getStatus(): Promise<'disconnected' | 'connecting' | 'connected' | 'disconnecting'>;
}
```

### 5.3 Events

| Event | Detail | Description |
|-------|--------|-------------|
| `conversationStarted` | void | Session connected |
| `conversationEnded` | void | Session disconnected |
| `statusChanged` | WidgetStatus | Status transitions |
| `messageReceived` | `{ role: 'user' | 'assistant', content: string }` | New message |
| `widgetError` | `{ message: string, code?: string }` | Error occurred |

---

## 6. Connection Modes

### 6.1 Text-Only Mode (WebSocket)

- **Trigger**: User types a message
- **Connection**: `connectionType: 'websocket'`
- **Audio**: None (no microphone required)
- **Use Case**: Users who prefer typing or can't use voice

```typescript
await Conversation.startSession({
  agentId: this.agentId,
  connectionType: 'websocket',
  overrides: {
    conversation: { textOnly: true },
    agent: { firstMessage: '' },
  },
});
```

### 6.2 Voice Mode (WebRTC)

- **Trigger**: User clicks voice button
- **Connection**: `connectionType: 'webrtc'`
- **Audio**: Bidirectional (microphone + speaker)
- **Use Case**: Hands-free voice conversations

```typescript
await navigator.mediaDevices.getUserMedia({ audio: true });
await Conversation.startSession({
  agentId: this.agentId,
  connectionType: 'webrtc',
});
```

---

## 7. File Structure

```
staylift-widget/
├── package.json              # Dependencies & scripts
├── stencil.config.ts         # Stencil build configuration
├── tsconfig.json             # TypeScript configuration
├── README.md                 # Usage documentation
├── tech_spec.md              # This document
└── src/
    ├── index.ts              # Component exports
    ├── types.ts              # Shared type exports
    ├── components.d.ts       # Auto-generated type declarations
    └── components/
        ├── staylift-widget/
        │   ├── staylift-widget.tsx   # Main component (~520 lines)
        │   └── staylift-widget.css   # Styles (~400 lines)
        └── staylift-orb/
            ├── staylift-orb.tsx      # Animated orb visualization
            └── staylift-orb.css      # Orb styles
# Build outputs (gitignored)
├── dist/                     # Production build
├── www/                      # Dev server files
└── .stencil/                 # Build cache
```

---

## 8. Build Outputs

```
dist/
├── staylift-widget/
│   ├── staylift-widget.esm.js    # ES Modules (modern browsers)
│   ├── staylift-widget.js        # UMD (legacy browsers)
│   └── staylift-widget.css       # Extracted styles
├── cjs/                          # CommonJS for Node.js
├── types/                        # TypeScript declarations
└── custom-elements/              # Custom Elements bundle
```

---

## 9. Integration Examples

### 9.1 Basic HTML

```html
<staylift-widget 
  agent-id="your-agent-id"
  brand-name="Grand Hotel Vienna"
  primary-color="#8b5cf6"
></staylift-widget>

<script type="module" src="https://unpkg.com/@staylift/voice-widget/dist/staylift-widget/staylift-widget.esm.js"></script>
```

### 9.2 React / Next.js

```tsx
'use client';
import { useEffect, useRef } from 'react';

export default function VoiceWidget() {
  const widgetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    import('@staylift/voice-widget');
    
    const widget = widgetRef.current;
    widget?.addEventListener('messageReceived', (e: CustomEvent) => {
      console.log('Message:', e.detail);
    });
  }, []);

  return (
    <staylift-widget
      ref={widgetRef}
      agent-id="your-agent-id"
      brand-name="Your Hotel"
    />
  );
}
```

### 9.3 Vue 3

```vue
<template>
  <staylift-widget
    agent-id="your-agent-id"
    brand-name="Your Hotel"
    @message-received="onMessage"
  />
</template>

<script setup>
import '@staylift/voice-widget';

const onMessage = (e) => {
  console.log('Message:', e.detail);
};
</script>
```

---

## 10. Deployment

### 10.1 Publish to npm

```bash
# Login to npm
npm login

# Build production bundle
npm run build

# Publish (makes available on unpkg automatically)
npm publish --access public
```

### 10.2 CDN URLs

```
# Latest version
https://unpkg.com/@staylift/voice-widget

# Specific version
https://unpkg.com/@staylift/voice-widget@1.0.0

# Direct ESM file
https://unpkg.com/@staylift/voice-widget/dist/staylift-widget/staylift-widget.esm.js
```

---

## 11. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **API Key Exposure** | Agent ID is public; sensitive ops require signed URLs from backend |
| **Microphone Access** | Explicit user permission required; text-only mode available |
| **XSS** | Shadow DOM isolates widget; no innerHTML usage |
| **CORS** | ElevenLabs handles CORS for their endpoints |

### For Private Agents

If the ElevenLabs agent requires authentication, implement a backend endpoint:

```typescript
// Your backend
app.get('/signed-url', authMiddleware, async (req, res) => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
    { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
  );
  const { signed_url } = await response.json();
  res.json({ signedUrl: signed_url });
});
```

---

## 12. Performance

| Metric | Value |
|--------|-------|
| **Bundle Size** | ~15kb gzipped (widget only) |
| **Time to Interactive** | <100ms (after script load) |
| **Memory Usage** | ~5MB (idle), ~15MB (active call) |
| **WebSocket Latency** | Depends on ElevenLabs servers |

### Optimization Tips

1. Use `defer` or `async` on script tag
2. Lazy load widget on user interaction
3. Use `variant="inline"` to avoid floating overlay repaints

---

## 13. Browser Support

| Browser | Minimum Version | Notes |
|---------|-----------------|-------|
| Chrome | 67+ | Full support |
| Firefox | 63+ | Full support |
| Safari | 10.1+ | Full support |
| Edge | 79+ | Full support (Chromium) |
| iOS Safari | 10.3+ | May require user gesture for audio |

**Required APIs**: Web Components, WebSocket, WebRTC, MediaDevices

---

## 14. Roadmap

- [ ] Generate React/Vue/Angular wrapper packages
- [ ] Add more languages (ES, FR, IT, etc.)
- [ ] Typing indicator animation
- [ ] Message timestamps
- [ ] Conversation history persistence
- [ ] Analytics integration
- [ ] Custom CSS theming API
- [ ] Accessibility improvements (ARIA)

---

## 15. License

MIT © Staylift

---

## 16. Contact

- **Website**: https://staylift.com
- **Support**: support@staylift.com
- **GitHub**: https://github.com/staylift/voice-widget