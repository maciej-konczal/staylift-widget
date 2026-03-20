import { Component, Prop, State, h, Event, EventEmitter, Method, Element } from '@stencil/core';
import { TextConversation, VoiceConversation } from '@elevenlabs/client';

export type WidgetStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export type WidgetPositionX = 'left' | 'center' | 'right';
export type WidgetPositionY = 'top' | 'bottom';
export type WidgetVariant = 'floating' | 'inline';
export type WidgetMode = 'light' | 'dark';
export type ConversationMode = 'text' | 'voice';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Blocked agent IDs (unpaid/inactive subscriptions)
const BLOCKED_AGENT_IDS: string[] = [
  // Add agent IDs here to block them, e.g.:
  // 'agent_abc123',
];

@Component({
  tag: 'staylift-widget',
  styleUrl: 'staylift-widget.css',
  shadow: true,
})
export class StayliftWidget {
  @Element() el: HTMLElement;

  // ============ PROPS ============
  @Prop() agentId!: string;
  @Prop() textAgentId?: string;  // Optional: separate agent for text mode
  @Prop() voiceAgentId?: string; // Optional: separate agent for voice mode
  @Prop() positionX: WidgetPositionX = 'right';
  @Prop() positionY: WidgetPositionY = 'bottom';
  @Prop() variant: WidgetVariant = 'floating';
  @Prop() mode: WidgetMode = 'dark';
  @Prop() primaryColor: string = '#6366f1';
  @Prop() brandName: string = 'Customer Support';
  @Prop() language: string = 'en';
  @Prop() autoExpand: boolean = false;
  @Prop() showBranding: boolean = true;
  @Prop() onlyText: boolean = false;

  // FAB customization
  @Prop() avatarUrl?: string;
  @Prop() fabPrompt: string = 'Do you need help?';
  @Prop() fabButtonText: string = 'Start';

  // ============ STATE ============
  @State() status: WidgetStatus = 'disconnected';
  @State() isExpanded: boolean = false;
  @State() termsAccepted: boolean = false;
  @State() errorMessage: string | null = null;
  @State() inputVolume: number = 0;
  @State() outputVolume: number = 0;
  @State() messages: ChatMessage[] = [];
  @State() inputText: string = '';
  @State() copiedIndex: number | null = null;
  @State() selectedMode: ConversationMode = 'text';

  // ============ EVENTS ============
  @Event() conversationStarted: EventEmitter<void>;
  @Event() conversationEnded: EventEmitter<void>;
  @Event() widgetError: EventEmitter<{ message: string; code?: string }>;
  @Event() statusChanged: EventEmitter<WidgetStatus>;
  @Event() messageReceived: EventEmitter<ChatMessage>;

  // ============ PRIVATE ============
  private conversation: TextConversation | VoiceConversation | null = null;
  private volumeInterval: ReturnType<typeof setInterval> | null = null;
  private messagesContainer: HTMLDivElement | null = null;
  private mediaStream: MediaStream | null = null;
  private isTextOnlyMode: boolean = true;

  // ============ LIFECYCLE ============
  componentWillLoad() {
    if (this.autoExpand) this.isExpanded = true;
    if (this.onlyText) this.selectedMode = 'text';
  }

  disconnectedCallback() {
    this.cleanup();
  }

  // ============ PUBLIC METHODS ============
  @Method()
  async startConversation(textOnly: boolean = true): Promise<void> {
    await this.handleStartConversation(textOnly);
  }

  @Method()
  async endConversation(): Promise<void> {
    await this.handleEndConversation();
  }

  @Method()
  async getStatus(): Promise<WidgetStatus> {
    return this.status;
  }

  @Method()
  async sendMessage(text: string): Promise<void> {
    await this.handleSendText(text);
  }

  // ============ PRIVATE METHODS ============

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const container = this.messagesContainer;
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 50);
    }
  }

  private async getMicStream(): Promise<MediaStream> {
    if (this.mediaStream) return this.mediaStream;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;
      this.errorMessage = null;
      return stream;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.errorMessage = this.t('microphoneError');
      }
      throw error;
    }
  }

  private async handleStartConversation(textOnly: boolean = true, skipClear: boolean = false): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return;

    try {
      this.errorMessage = null;
      this.status = 'connecting';
      this.isTextOnlyMode = textOnly;
      this.statusChanged.emit(this.status);

      if (!skipClear) this.messages = [];
      if (!textOnly) await this.getMicStream();

      // Store pending message to send after connection
      const messageToSend = this.pendingMessage;

      // Create a promise that resolves when we're connected or rejects on failure
      let resolveConnected: () => void;
      let rejectConnected: (error: Error) => void;
      const connectedPromise = new Promise<void>((resolve, reject) => {
        resolveConnected = resolve;
        rejectConnected = reject;
      });

      // Add connection timeout
      const CONNECTION_TIMEOUT = 15000;
      const timeoutId = setTimeout(() => {
        rejectConnected(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);

      // Use TextConversation for text-only mode (no mic access), VoiceConversation for voice
      const ConversationClass = textOnly ? TextConversation : VoiceConversation;

      // Use mode-specific agent ID if provided, otherwise fall back to main agentId
      const effectiveAgentId = textOnly
        ? (this.textAgentId || this.agentId)
        : (this.voiceAgentId || this.agentId);

      this.conversation = await ConversationClass.startSession({
        agentId: effectiveAgentId,
        connectionType: textOnly ? 'websocket' : 'webrtc',
        overrides: {
          conversation: {
            textOnly,
            // Enable streaming text responses for text mode
            client_events: textOnly ? ['agent_response', 'agent_chat_response_part', 'user_transcript'] : undefined,
          } as any,
        },
        onStatusChange: (statusEvent: { status: string }) => {
          const newStatus = statusEvent.status as WidgetStatus;
          const previousStatus = this.status;
          this.status = newStatus;
          this.statusChanged.emit(newStatus);

          // Handle connected state
          if (newStatus === 'connected' && previousStatus !== 'connected') {
            clearTimeout(timeoutId);
            this.conversationStarted.emit();
            if (!textOnly) this.startVolumeMonitoring();
            resolveConnected(); // Signal that we're connected
          }

          // Handle disconnected state
          if (newStatus === 'disconnected') {
            if (previousStatus === 'connected') {
              this.conversationEnded.emit();
              this.stopVolumeMonitoring();
            } else if (previousStatus === 'connecting') {
              // Connection failed before establishing
              clearTimeout(timeoutId);
              rejectConnected(new Error('Connection failed'));
            }
          }
        },
        onMessage: (message: { message?: string; source?: string; role?: string }) => {
          if (message.message) {
            // Use 'role' if available, fallback to deprecated 'source'
            const messageRole = message.role || message.source;
            const chatMessage: ChatMessage = {
              role: messageRole === 'user' ? 'user' : 'assistant',
              content: message.message,
            };
            this.messages = [...this.messages, chatMessage];
            this.messageReceived.emit(chatMessage);
            this.scrollToBottom();
          }
        },
        onError: (error: unknown) => {
          this.errorMessage = this.t('connectionError');
          this.status = 'disconnected';
          this.statusChanged.emit(this.status);
          this.widgetError.emit({ message: String(error) });
        },
      });

      // Wait for connected status before sending message
      await connectedPromise;

      // Now send the pending message (status is guaranteed 'connected' after promise resolves)
      if (messageToSend && this.conversation) {
        this.conversation.sendUserMessage(messageToSend);
        this.pendingMessage = null;
      }
    } catch (error) {
      this.status = 'disconnected';
      this.statusChanged.emit(this.status);
      // Don't clear messages - keep user's message visible
      this.pendingMessage = null;

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.errorMessage = this.t('microphoneError');
      } else {
        this.errorMessage = this.t('connectionError');
      }

      this.widgetError.emit({ message: this.errorMessage });
    }
  }

  private async handleEndConversation(): Promise<void> {
    if (!this.conversation) return;

    this.status = 'disconnecting';
    this.statusChanged.emit(this.status);
    await this.conversation.endSession();
    this.conversation = null;
    this.status = 'disconnected';
    this.statusChanged.emit(this.status);

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private pendingMessage: string | null = null;

  private async handleSendText(text?: string): Promise<void> {
    const msg = text || this.inputText.trim();
    if (!msg) return;

    // If disconnected, start session based on selected mode
    if (this.status === 'disconnected') {
      const userMessage: ChatMessage = { role: 'user', content: msg };
      this.inputText = '';
      this.pendingMessage = msg; // Store message to send after connection
      this.messages = [userMessage];
      this.scrollToBottom();

      const textOnly = this.selectedMode === 'text';
      try {
        await this.handleStartConversation(textOnly, true);
        // Message will be sent in onConnect callback
      } catch {
        this.pendingMessage = null;
      }
    } else if (this.status === 'connected') {
      const userMessage: ChatMessage = { role: 'user', content: msg };
      this.messages = [...this.messages, userMessage];
      this.inputText = '';
      if (this.conversation && typeof this.conversation.sendUserMessage === 'function') {
        this.conversation.sendUserMessage(msg);
      } else {
        console.error('[Staylift] Cannot send message: no active conversation');
      }
      this.scrollToBottom();
    }
  }

  private async handleVoiceButton(): Promise<void> {
    if (this.status === 'disconnected' || this.status === null) {
      await this.handleStartConversation(false);
    } else if (this.status === 'connected') {
      await this.handleEndConversation();
    }
  }

  private async handleTextButton(): Promise<void> {
    if (this.status === 'disconnected' || this.status === null) {
      await this.handleStartConversation(true);
    } else if (this.status === 'connected') {
      await this.handleEndConversation();
    }
  }

  private handleInputKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSendText();
    }
  };

  private handleInputChange = (e: Event): void => {
    this.inputText = (e.target as HTMLInputElement).value;
  };

  private startVolumeMonitoring(): void {
    this.volumeInterval = setInterval(() => {
      if (this.conversation && this.status === 'connected') {
        const input = this.conversation.getInputVolume?.() ?? 0;
        const output = this.conversation.getOutputVolume?.() ?? 0;
        this.inputVolume = Math.min(1.0, Math.pow(input, 0.5) * 2.5);
        this.outputVolume = Math.min(1.0, Math.pow(output, 0.5) * 2.5);
      }
    }, 50);
  }

  private stopVolumeMonitoring(): void {
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }
    this.inputVolume = 0;
    this.outputVolume = 0;
  }

  private cleanup(): void {
    this.stopVolumeMonitoring();
    if (this.conversation) {
      this.conversation.endSession();
      this.conversation = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }

  private handleToggleExpand = (): void => {
    this.isExpanded = !this.isExpanded;
  };

  private copyToClipboard = (text: string, index: number): void => {
    navigator.clipboard.writeText(text);
    this.copiedIndex = index;
    setTimeout(() => { this.copiedIndex = null; }, 2000);
  };

  private t(key: string): string {
    const translations: Record<string, Record<string, string>> = {
      en: {
        microphoneError: 'Please enable microphone permissions in your browser.',
        connectionError: 'Connection failed. Please try again.',
        tapToStart: 'Tap to start voice chat',
        connected: 'Connected',
        placeholder: 'Type a message...',
        emptyTitle: 'Start a conversation',
        emptyDesc: 'Type a message or tap the voice button',
        emptyDescTextOnly: 'Type a message to get started',
        starting: 'Starting conversation',
        connecting: 'Connecting...',
        ready: 'Ready to chat',
        talkOrType: 'Start talking or type',
        poweredBy: 'Powered by Staylift',
        termsTitle: 'Terms and Conditions',
        termsText: 'By clicking "Agree," and each time I interact with this AI agent, I consent to the recording, storage, and sharing of my communications with third-party service providers, and as described in the Privacy Policy.',
        termsWarning: 'If you do not wish to have your conversations recorded, please refrain from using this service.',
        termsAgree: 'Agree',
        termsDecline: 'Decline',
        modeText: 'Text',
        modeVoice: 'Voice',
        startVoice: 'Start Voice Call',
        endVoice: 'End Call',
        startText: 'Start Text Chat',
        endText: 'End Chat',
      },
      pl: {
        microphoneError: 'Proszę włączyć uprawnienia mikrofonu.',
        connectionError: 'Połączenie nieudane. Spróbuj ponownie.',
        tapToStart: 'Dotknij, aby rozpocząć rozmowę',
        connected: 'Połączono',
        placeholder: 'Napisz wiadomość...',
        emptyTitle: 'Rozpocznij rozmowę',
        emptyDesc: 'Napisz wiadomość lub naciśnij przycisk głosowy',
        emptyDescTextOnly: 'Napisz wiadomość, aby rozpocząć',
        starting: 'Rozpoczynanie rozmowy',
        connecting: 'Łączenie...',
        ready: 'Gotowe do czatu',
        talkOrType: 'Mów lub pisz',
        poweredBy: 'Powered by Staylift',
        termsTitle: 'Regulamin',
        termsText: 'Klikając „Akceptuję” i za każdym razem, gdy wchodzę w interakcję z tym agentem AI, wyrażam zgodę na nagrywanie, przechowywanie i udostępnianie mojej komunikacji zewnętrznym dostawcom usług, zgodnie z opisem w Polityce Prywatności.',
        termsWarning: 'Jeśli nie życzysz sobie nagrywania swoich rozmów, prosimy o powstrzymanie się od korzystania z tej usługi.',
        termsAgree: 'Akceptuję',
        termsDecline: 'Odrzucam',
        modeText: 'Tekst',
        modeVoice: 'Głos',
        startVoice: 'Rozpocznij rozmowę głosową',
        endVoice: 'Zakończ',
        startText: 'Rozpocznij czat',
        endText: 'Zakończ czat',
      },
      de: {
        microphoneError: 'Bitte aktivieren Sie die Mikrofonberechtigung in Ihrem Browser.',
        connectionError: 'Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.',
        tapToStart: 'Tippen, um den Voice-Chat zu starten',
        connected: 'Verbunden',
        placeholder: 'Nachricht eingeben...',
        emptyTitle: 'Gespräch starten',
        emptyDesc: 'Nachricht eingeben oder Voice-Button drücken',
        emptyDescTextOnly: 'Schreiben Sie eine Nachricht, um zu beginnen',
        starting: 'Gespräch wird gestartet',
        connecting: 'Verbindung wird hergestellt...',
        ready: 'Bereit zum Chatten',
        talkOrType: 'Sprechen oder tippen',
        poweredBy: 'Powered by Staylift',
        termsTitle: 'Nutzungsbedingungen',
        termsText: 'Durch Klicken auf „Zustimmen" und bei jeder Interaktion mit diesem KI-Agenten stimme ich der Aufzeichnung, Speicherung und Weitergabe meiner Kommunikation an Drittanbieter zu, wie in der Datenschutzrichtlinie beschrieben.',
        termsWarning: 'Wenn Sie nicht möchten, dass Ihre Gespräche aufgezeichnet werden, verwenden Sie diesen Dienst bitte nicht.',
        termsAgree: 'Zustimmen',
        termsDecline: 'Ablehnen',
        modeText: 'Text',
        modeVoice: 'Stimme',
        startVoice: 'Sprachanruf starten',
        endVoice: 'Beenden',
        startText: 'Text-Chat starten',
        endText: 'Chat beenden',
      },
    };
    return translations[this.language]?.[key] || translations['en'][key] || key;
  }

  private handleAcceptTerms = () => {
    this.termsAccepted = true;
  };

  private handleDeclineTerms = () => {
    this.isExpanded = false;
  };

  private getPositionClasses(): string {
    return `sl-x-${this.positionX} sl-y-${this.positionY}`;
  }

  // ============ RENDER ============
  
  private getThemeColors() {
    if (this.mode === 'light') {
      return {
        bg: '#ffffff',
        text: '#18181b',
        muted: '#71717a',
        border: '#e4e4e7',
        surface: '#f4f4f5',
      };
    }
    return {
      bg: '#18181b',
      text: '#ffffff',
      muted: '#a1a1aa',
      border: '#27272a',
      surface: '#27272a',
    };
  }

  render() {
    // Block rendering for unpaid/inactive agent IDs
    if (BLOCKED_AGENT_IDS.includes(this.agentId)) return null;

    const isTransitioning = this.status === 'connecting' || this.status === 'disconnecting';
    const isCallActive = this.status === 'connected' && !this.isTextOnlyMode;
    const theme = this.getThemeColors();

    const cssVars = {
      '--sl-primary': this.primaryColor,
      '--sl-bg': theme.bg,
      '--sl-text': theme.text,
      '--sl-muted': theme.muted,
      '--sl-border': theme.border,
      '--sl-surface': theme.surface,
    };

    if (this.variant === 'inline') {
      return (
        <div class="sl-widget sl-inline" style={cssVars}>
          {this.renderCard(isTransitioning)}
        </div>
      );
    }

    return (
      <div class={`sl-widget sl-floating ${this.getPositionClasses()}`} style={cssVars}>
        {this.isExpanded ? (
          <div class="sl-card">
            {this.renderCard(isTransitioning)}
          </div>
        ) : (
          <div class="sl-fab-pill">
            <div class="sl-fab-avatar">
              {this.avatarUrl ? (
                <img src={this.avatarUrl} alt="" class="sl-fab-avatar-img" />
              ) : (
                <staylift-orb
                  size={48}
                  primaryColor={this.primaryColor}
                  inputVolume={this.inputVolume}
                  outputVolume={this.outputVolume}
                  isActive={isCallActive}
                />
              )}
            </div>
            <div class="sl-fab-content">
              <span class="sl-fab-prompt">{this.fabPrompt}</span>
              <button class="sl-fab-btn" onClick={this.handleToggleExpand}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                {this.fabButtonText}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  private renderCard(isTransitioning: boolean) {
    if (!this.termsAccepted) {
      return this.renderTerms();
    }
    return [
      this.renderHeader(isTransitioning),
      this.renderContent(),
      this.renderFooter(isTransitioning),
    ];
  }

  private renderTerms() {
    return (
      <div class="sl-terms">
        <div class="sl-terms-content">
          <h3 class="sl-terms-title">{this.t('termsTitle')}</h3>
          <p class="sl-terms-text">{this.t('termsText')}</p>
          <p class="sl-terms-warning">{this.t('termsWarning')}</p>
        </div>
        <div class="sl-terms-actions">
          <button class="sl-terms-btn sl-terms-btn--decline" onClick={this.handleDeclineTerms}>
            {this.t('termsDecline')}
          </button>
          <button class="sl-terms-btn sl-terms-btn--agree" onClick={this.handleAcceptTerms}>
            {this.t('termsAgree')}
          </button>
        </div>
      </div>
    );
  }

  private renderHeader(isTransitioning: boolean) {
    return (
      <div class="sl-header">
        <div class="sl-header-left">
          <div class="sl-orb-ring">
            {this.avatarUrl ? (
              <img src={this.avatarUrl} alt="" class="sl-header-avatar-img" />
            ) : (
              <staylift-orb
                size={40}
                primaryColor={this.primaryColor}
                inputVolume={this.inputVolume}
                outputVolume={this.outputVolume}
                isActive={this.status === 'connected' && !this.isTextOnlyMode}
              />
            )}
          </div>
          <div class="sl-header-text">
            <span class="sl-title">{this.brandName}</span>
            <span class="sl-subtitle">
              {this.errorMessage ? (
                <span class="sl-error">{this.errorMessage}</span>
              ) : this.status === 'disconnected' ? (
                this.t('tapToStart')
              ) : this.status === 'connected' ? (
                <span class="sl-connected">{this.t('connected')}</span>
              ) : isTransitioning ? (
                <span class="sl-shimmer">{this.status}</span>
              ) : null}
            </span>
          </div>
        </div>
        <div class="sl-header-right">
          <div class={`sl-dot ${this.status === 'connected' ? 'sl-dot--active' : ''} ${isTransitioning ? 'sl-dot--pulse' : ''}`} />
          {this.variant === 'floating' && (
            <button class="sl-close" onClick={this.handleToggleExpand}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  private renderContent() {
    const isConnecting = this.status === 'connecting';
    const isConnected = this.status === 'connected';

    return (
      <div class="sl-content" ref={(el) => this.messagesContainer = el ?? null}>
        {this.messages.length === 0 ? (
          <div class="sl-empty">
            {this.avatarUrl ? (
              <img src={this.avatarUrl} alt="" class="sl-empty-avatar" />
            ) : (
              <staylift-orb size={48} primaryColor={this.primaryColor} isActive={false} />
            )}
            <h3 class="sl-empty-title">
              {isConnecting ? this.t('starting') : isConnected ? this.t('talkOrType') : this.t('emptyTitle')}
            </h3>
            <p class="sl-empty-desc">
              {isConnecting ? this.t('connecting') : isConnected ? this.t('ready') : this.t(this.onlyText ? 'emptyDescTextOnly' : 'emptyDesc')}
            </p>
          </div>
        ) : (
          this.messages.map((message, index) => (
            <div class={`sl-msg sl-msg--${message.role}`} key={index}>
              <div class="sl-msg-row">
                <div class="sl-msg-bubble">{message.content}</div>
              </div>
              {message.role === 'assistant' && (
                <div class="sl-msg-actions">
                  <button class="sl-action" onClick={() => this.copyToClipboard(message.content, index)}>
                    {this.copiedIndex === index ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  private renderFooter(isTransitioning: boolean) {
    const isDisconnected = this.status === 'disconnected';
    const isConnectedText = this.status === 'connected' && this.isTextOnlyMode;
    const isConnectedVoice = this.status === 'connected' && !this.isTextOnlyMode;
    // Only show text input when connected in text mode
    const showTextInput = isConnectedText;

    return (
      <div class="sl-footer">
        {/* Mode toggle - only show when disconnected and not only-text */}
        {isDisconnected && !this.onlyText && (
          <div class="sl-mode-toggle">
            <button
              class={`sl-mode-btn ${this.selectedMode === 'text' ? 'sl-mode-btn--active' : ''}`}
              onClick={() => this.selectedMode = 'text'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              {this.t('modeText')}
            </button>
            <button
              class={`sl-mode-btn ${this.selectedMode === 'voice' ? 'sl-mode-btn--active' : ''}`}
              onClick={() => this.selectedMode = 'voice'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              {this.t('modeVoice')}
            </button>
          </div>
        )}

        {/* Text input row - show when connected in text mode */}
        {showTextInput && (
          <div class="sl-input-row">
            <button
              class="sl-btn sl-btn--end"
              onClick={() => this.handleTextButton()}
              disabled={isTransitioning}
              title={this.t('endText')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <input
              type="text"
              class="sl-input"
              placeholder={this.t('placeholder')}
              value={this.inputText}
              onInput={this.handleInputChange}
              onKeyDown={this.handleInputKeyDown}
              disabled={isTransitioning}
            />
            <button
              class="sl-btn"
              onClick={() => this.handleSendText()}
              disabled={!this.inputText.trim() || isTransitioning}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        )}

        {/* Text controls - show "Start Text Chat" when disconnected and text mode selected */}
        {this.selectedMode === 'text' && isDisconnected && (
          <div class="sl-voice-controls">
            <button
              class="sl-voice-btn"
              onClick={() => this.handleTextButton()}
              disabled={isTransitioning}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              {isTransitioning ? this.t('connecting') : this.t('startText')}
            </button>
          </div>
        )}

        {/* Voice controls - show for voice mode when disconnected or connected */}
        {this.selectedMode === 'voice' && isDisconnected && (
          <div class="sl-voice-controls">
            <button
              class="sl-voice-btn"
              onClick={() => this.handleVoiceButton()}
              disabled={isTransitioning}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              {isTransitioning ? this.t('connecting') : this.t('startVoice')}
            </button>
          </div>
        )}

        {/* End call button - show when connected in voice mode */}
        {isConnectedVoice && (
          <div class="sl-voice-controls">
            <button
              class="sl-voice-btn sl-voice-btn--end"
              onClick={() => this.handleVoiceButton()}
              disabled={isTransitioning}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                <line x1="22" y1="2" x2="2" y2="22"></line>
              </svg>
              {this.t('endVoice')}
            </button>
          </div>
        )}

        {this.showBranding && (
          <div class="sl-branding">
            <a href="https://stayliftnow.com" target="_blank" rel="noopener noreferrer">
              <img
                src="data:image/png;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8IAEQgAIAAgAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAMCBAEFAAYHCAkKC//EAMMQAAEDAwIEAwQGBAcGBAgGcwECAAMRBBIhBTETIhAGQVEyFGFxIweBIJFCFaFSM7EkYjAWwXLRQ5I0ggjhU0AlYxc18JNzolBEsoPxJlQ2ZJR0wmDShKMYcOInRTdls1V1pJXDhfLTRnaA40dWZrQJChkaKCkqODk6SElKV1hZWmdoaWp3eHl6hoeIiYqQlpeYmZqgpaanqKmqsLW2t7i5usDExcbHyMnK0NTV1tfY2drg5OXm5+jp6vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAQIAAwQFBgcICQoL/8QAwxEAAgIBAwMDAgMFAgUCBASHAQACEQMQEiEEIDFBEwUwIjJRFEAGMyNhQhVxUjSBUCSRoUOxFgdiNVPw0SVgwUThcvEXgmM2cCZFVJInotIICQoYGRooKSo3ODk6RkdISUpVVldYWVpkZWZnaGlqc3R1dnd4eXqAg4SFhoeIiYqQk5SVlpeYmZqgo6SlpqeoqaqwsrO0tba3uLm6wMLDxMXGx8jJytDT1NXW19jZ2uDi4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/2gAMAwEAAhEDEQAAAfiPo6T9gTw/lbxH1R8xAWn0XwXsuXwv2J+cvsHnGXj/AP/aAAgBAQABBQJ2O0btujuvDXiGygZS/B6bCDwr9Yvii93+QRKL5RL8C7HvO8yb3t22f0cO3xxpg2+r22+3Pbre83K/u0XUoD//2gAIAQMRAT8BwnczyRDk/enDhl9/j+j8l+8kutyx9kUA/wD/2gAIAQIRAT8B0OVnO3//2gAIAQEABj8CajttnLc48eWgqo1XV5t08MMftLWggDvtxssUw8hKlH+VTrr9rTFZoWnZ41URJQhMyx+avw8nw7SWKbmWDaf+BASqiVfyR8S7mwljSi1jhISnyTQdNPtfB8GLe1uVxRjXFLwurhcqR5E6dv/EADMQAQADAAICAgICAwEBAAACCwERACExQVFhcYGRobHB8NEQ4fEgMEBQYHCAkKCwwNDg/9oACAEBAAE/IZsYHlgL2hFFykgNxq/8i4rZQAQHMl53M1Hu+FPRCE0H7+OCoZU37nAvVx5U656pS9EIT8wQj3YdyrMaSOzIAl5fmjVxMtl8cUFL/9oADAMBAAIRAxEAABD2kov/xAAzEQEBAQADAAECBQUBAQABAQkBABEhMRBBUWEgcfCRgaGx0cHh8TBAUGBwgJCgsMDQ4P/aAAgBAxEBPxDT3M5sJdI+Ma/bs4t0zZy8v7fT4v/aAAgBAhEBPxBPA2RcX//aAAgBAQABPxCXMUdNxPzQSDHSzRnYYmQIwJUDyoU5qBhvVIgVuSPBo61iI8V5sIdq5DxIPbJQrnR+qCA5rryHQleAAiIk2UhJuwnSp6JKa/KjgYm/NRmPignYSnymSrtfVNewxg4eEjzFnxEX/9k="
                alt="Staylift"
                class="sl-branding-logo"
              />
              {this.t('poweredBy')}
            </a>
          </div>
        )}
      </div>
    );
  }
}
