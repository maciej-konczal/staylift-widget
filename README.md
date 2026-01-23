# Staylift Conversational Widget

**Voice + Text Chat** widget for hotels, powered by ElevenLabs Conversational AI.

## Features

- 🎙️ **Voice Calls** - Natural voice conversations with AI
- 💬 **Text Chat** - Type messages when you can't talk
- 🌍 **Multi-language** - EN, PL, DE built-in (extensible)
- 🎨 **Customizable** - Match your hotel's branding
- 📱 **Responsive** - Works on mobile and desktop

## Quick Start

### CDN (For hotels)

```html
<staylift-widget 
  agent-id="your-elevenlabs-agent-id"
  brand-name="Your Hotel Name"
  primary-color="#8b5cf6"
></staylift-widget>

<script src="https://unpkg.com/@staylift-tech/conv-widget"></script>
```

### NPM (For developers)

```bash
npm install @staylift-tech/conv-widget
```

```javascript
import '@staylift-tech/conv-widget';
```

## How It Works

1. User clicks the floating orb → Chat window opens
2. User clicks phone button → Voice call starts
3. User can **speak** OR **type** messages
4. All messages appear in the chat history
5. ElevenLabs AI responds via voice + text

## Configuration

### Required

| Attribute | Description |
|-----------|-------------|
| `agent-id` | Your ElevenLabs Conversational AI Agent ID |

### Appearance

| Attribute | Default | Description |
|-----------|---------|-------------|
| `brand-name` | "Virtual Concierge" | Hotel name in header |
| `subtitle` | "Ask me anything..." | Subtitle text |
| `primary-color` | "#10b981" | Brand color (hex) |
| `background-color` | "#ffffff" | Background color |
| `text-color` | "#1f2937" | Text color |
| `logo-url` | - | Custom logo image URL |

### Layout

| Attribute | Default | Options |
|-----------|---------|---------|
| `variant` | "floating" | `floating`, `inline`, `compact` |
| `position` | "bottom-right" | `bottom-right`, `bottom-left`, `top-right`, `top-left` |

### Behavior

| Attribute | Default | Description |
|-----------|---------|-------------|
| `language` | "en" | UI language (`en`, `pl`, `de`) |
| `auto-expand` | false | Open chat on page load |
| `show-branding` | true | Show "Powered by Staylift" |

## Events

```javascript
const widget = document.querySelector('staylift-widget');

// Connection
widget.addEventListener('conversationStarted', () => {
  console.log('Voice call connected');
});

widget.addEventListener('conversationEnded', () => {
  console.log('Voice call ended');
});

// Messages
widget.addEventListener('messageReceived', (event) => {
  const { role, content } = event.detail;
  console.log(`${role}: ${content}`);
});

// Status
widget.addEventListener('statusChanged', (event) => {
  console.log('Status:', event.detail); // 'disconnected' | 'connecting' | 'connected'
});

// Errors
widget.addEventListener('widgetError', (event) => {
  console.error('Error:', event.detail.message);
});
```

## Methods

```javascript
const widget = document.querySelector('staylift-widget');

// Start voice call
await widget.startConversation();

// End voice call
await widget.endConversation();

// Send text message (while connected)
await widget.sendMessage('What time is checkout?');

// Get current status
const status = await widget.getStatus();
```

## Variants

### Floating (Default)
Full chat window that appears when clicking the orb.

```html
<staylift-widget 
  agent-id="xxx"
  variant="floating"
  position="bottom-right"
></staylift-widget>
```

### Inline
Embed directly in your page.

```html
<staylift-widget 
  agent-id="xxx"
  variant="inline"
></staylift-widget>
```

### Compact
Minimal horizontal bar.

```html
<staylift-widget 
  agent-id="xxx"
  variant="compact"
></staylift-widget>
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm start

# Build for production
npm run build

# Publish to npm
npm publish --access public
```

## Framework Integration

### React / Next.js

```jsx
'use client';
import { useEffect } from 'react';

export default function VoiceWidget() {
  useEffect(() => {
    import('@staylift/voice-widget');
  }, []);

  return (
    <staylift-widget
      agent-id="your-agent-id"
      brand-name="Your Hotel"
    />
  );
}
```

### Vue

```vue
<template>
  <staylift-widget
    agent-id="your-agent-id"
    brand-name="Your Hotel"
  />
</template>

<script setup>
import '@staylift-tech/conv-widget';
</script>
```

## Browser Support

Chrome 67+, Firefox 63+, Safari 10.1+, Edge 79+

## License

MIT © Staylift
