import { Component, Prop, State, h, Event, EventEmitter, Method, Element } from '@stencil/core';
import { Conversation } from '@elevenlabs/client';

export type WidgetStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
export type WidgetPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type WidgetVariant = 'floating' | 'inline';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Component({
  tag: 'staylift-widget',
  styleUrl: 'staylift-widget.css',
  shadow: true,
})
export class StayliftWidget {
  @Element() el: HTMLElement;

  // ============ PROPS ============
  @Prop() agentId!: string;
  @Prop() position: WidgetPosition = 'bottom-right';
  @Prop() variant: WidgetVariant = 'floating';
  @Prop() primaryColor: string = '#6366f1';
  @Prop() backgroundColor: string = '#18181b';
  @Prop() textColor: string = '#ffffff';
  @Prop() brandName: string = 'Customer Support';
  @Prop() language: string = 'en';
  @Prop() autoExpand: boolean = false;
  @Prop() showBranding: boolean = true;

  // ============ STATE ============
  @State() status: WidgetStatus = 'disconnected';
  @State() isExpanded: boolean = false;
  @State() errorMessage: string | null = null;
  @State() inputVolume: number = 0;
  @State() outputVolume: number = 0;
  @State() messages: ChatMessage[] = [];
  @State() inputText: string = '';
  @State() copiedIndex: number | null = null;

  // ============ EVENTS ============
  @Event() conversationStarted: EventEmitter<void>;
  @Event() conversationEnded: EventEmitter<void>;
  @Event() widgetError: EventEmitter<{ message: string; code?: string }>;
  @Event() statusChanged: EventEmitter<WidgetStatus>;
  @Event() messageReceived: EventEmitter<ChatMessage>;

  // ============ PRIVATE ============
  private conversation: Conversation | null = null;
  private volumeInterval: ReturnType<typeof setInterval> | null = null;
  private messagesContainer: HTMLDivElement | null = null;
  private mediaStream: MediaStream | null = null;
  private isTextOnlyMode: boolean = true;

  // ============ LIFECYCLE ============
  componentWillLoad() {
    if (this.autoExpand) this.isExpanded = true;
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
      setTimeout(() => {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
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

      this.conversation = await Conversation.startSession({
        agentId: this.agentId,
        connectionType: textOnly ? 'websocket' : 'webrtc',
        overrides: {
          conversation: { textOnly },
          agent: { firstMessage: textOnly ? '' : undefined },
        },
        onConnect: () => {
          this.status = 'connected';
          this.statusChanged.emit(this.status);
          this.conversationStarted.emit();
          if (!textOnly) this.startVolumeMonitoring();
        },
        onDisconnect: () => {
          this.status = 'disconnected';
          this.statusChanged.emit(this.status);
          this.conversationEnded.emit();
          this.stopVolumeMonitoring();
        },
        onMessage: (message) => {
          if (message.message) {
            const chatMessage: ChatMessage = {
              role: message.source === 'user' ? 'user' : 'assistant',
              content: message.message,
            };
            this.messages = [...this.messages, chatMessage];
            this.messageReceived.emit(chatMessage);
            this.scrollToBottom();
          }
        },
        onError: (error) => {
          console.error('Staylift:', error);
          this.errorMessage = this.t('connectionError');
          this.status = 'disconnected';
          this.statusChanged.emit(this.status);
          this.widgetError.emit({ message: String(error) });
        },
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      this.status = 'disconnected';
      this.statusChanged.emit(this.status);
      this.messages = [];
      
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

  private async handleSendText(text?: string): Promise<void> {
    const msg = text || this.inputText.trim();
    if (!msg) return;

    // If disconnected, start text-only session
    if (this.status === 'disconnected' || this.status === null) {
      const userMessage: ChatMessage = { role: 'user', content: msg };
      this.inputText = '';
      
      try {
        await this.handleStartConversation(true, true);
        this.messages = [userMessage];
        this.conversation?.sendUserMessage?.(msg);
      } catch (error) {
        console.error('Failed to start conversation:', error);
      }
    } else if (this.status === 'connected') {
      const userMessage: ChatMessage = { role: 'user', content: msg };
      this.messages = [...this.messages, userMessage];
      this.inputText = '';
      this.conversation?.sendUserMessage?.(msg);
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
        starting: 'Starting conversation',
        connecting: 'Connecting...',
        ready: 'Ready to chat',
        talkOrType: 'Start talking or type',
      },
      pl: {
        microphoneError: 'Proszę włączyć uprawnienia mikrofonu.',
        connectionError: 'Połączenie nieudane. Spróbuj ponownie.',
        tapToStart: 'Dotknij, aby rozpocząć rozmowę',
        connected: 'Połączono',
        placeholder: 'Napisz wiadomość...',
        emptyTitle: 'Rozpocznij rozmowę',
        emptyDesc: 'Napisz wiadomość lub naciśnij przycisk głosowy',
        starting: 'Rozpoczynanie rozmowy',
        connecting: 'Łączenie...',
        ready: 'Gotowe do czatu',
        talkOrType: 'Mów lub pisz',
      },
    };
    return translations[this.language]?.[key] || translations['en'][key] || key;
  }

  private getPositionClasses(): string {
    return `sl-${this.position}`;
  }

  // ============ RENDER ============
  
  render() {
    const isTransitioning = this.status === 'connecting' || this.status === 'disconnecting';
    const isCallActive = this.status === 'connected' && !this.isTextOnlyMode;

    const cssVars = {
      '--sl-primary': this.primaryColor,
      '--sl-bg': this.backgroundColor,
      '--sl-text': this.textColor,
    };

    if (this.variant === 'inline') {
      return (
        <div class="sl-widget sl-inline" style={cssVars}>
          {this.renderCard(isCallActive, isTransitioning)}
        </div>
      );
    }

    return (
      <div class={`sl-widget sl-floating ${this.getPositionClasses()}`} style={cssVars}>
        {this.isExpanded ? (
          <div class="sl-card">
            {this.renderCard(isCallActive, isTransitioning)}
          </div>
        ) : (
          <button class="sl-fab" onClick={this.handleToggleExpand}>
            <staylift-orb 
              size={48} 
              primaryColor={this.primaryColor}
              inputVolume={this.inputVolume}
              outputVolume={this.outputVolume}
              isActive={isCallActive}
            />
          </button>
        )}
      </div>
    );
  }

  private renderCard(isCallActive: boolean, isTransitioning: boolean) {
    return [
      this.renderHeader(isTransitioning),
      this.renderContent(),
      this.renderFooter(isCallActive, isTransitioning),
    ];
  }

  private renderHeader(isTransitioning: boolean) {
    return (
      <div class="sl-header">
        <div class="sl-header-left">
          <div class="sl-orb-ring">
            <staylift-orb 
              size={40} 
              primaryColor={this.primaryColor}
              inputVolume={this.inputVolume}
              outputVolume={this.outputVolume}
              isActive={this.status === 'connected' && !this.isTextOnlyMode}
            />
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
      <div class="sl-content" ref={(el) => this.messagesContainer = el}>
        {this.messages.length === 0 ? (
          <div class="sl-empty">
            <staylift-orb size={48} primaryColor={this.primaryColor} isActive={false} />
            <h3 class="sl-empty-title">
              {isConnecting ? this.t('starting') : isConnected ? this.t('talkOrType') : this.t('emptyTitle')}
            </h3>
            <p class="sl-empty-desc">
              {isConnecting ? this.t('connecting') : isConnected ? this.t('ready') : this.t('emptyDesc')}
            </p>
          </div>
        ) : (
          this.messages.map((message, index) => (
            <div class={`sl-msg sl-msg--${message.role}`} key={index}>
              <div class="sl-msg-row">
                <div class="sl-msg-bubble">{message.content}</div>
                {message.role === 'assistant' && (
                  <div class="sl-msg-orb">
                    <staylift-orb size={24} primaryColor={this.primaryColor} isActive={false} />
                  </div>
                )}
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

  private renderFooter(isCallActive: boolean, isTransitioning: boolean) {
    return (
      <div class="sl-footer">
        <div class="sl-input-row">
          <input
            type="text"
            class="sl-input"
            placeholder={this.t('placeholder')}
            value={this.inputText}
            onInput={this.handleInputChange}
            onKeyDown={this.handleInputKeyDown}
            disabled={isTransitioning}
          />
          
          {/* Send button */}
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
          
          {/* Voice button */}
          {!isCallActive ? (
            <button 
              class="sl-btn"
              onClick={() => this.handleVoiceButton()}
              disabled={isTransitioning}
            >
              {/* AudioLines icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 10v3"></path>
                <path d="M6 6v11"></path>
                <path d="M10 3v18"></path>
                <path d="M14 8v7"></path>
                <path d="M18 5v13"></path>
                <path d="M22 10v3"></path>
              </svg>
            </button>
          ) : (
            <button 
              class="sl-btn sl-btn--end"
              onClick={() => this.handleVoiceButton()}
              disabled={isTransitioning}
            >
              {/* PhoneOff icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                <line x1="22" y1="2" x2="2" y2="22"></line>
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }
}
