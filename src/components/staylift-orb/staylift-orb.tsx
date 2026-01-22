import { Component, Prop, State, h, Element } from '@stencil/core';

@Component({
  tag: 'staylift-orb',
  styleUrl: 'staylift-orb.scss',
  shadow: true,
})
export class StayliftOrb {
  @Element() el!: HTMLElement;
  @Prop() inputVolume: number = 0;
  @Prop() outputVolume: number = 0;
  @Prop() isActive: boolean = false;
  @Prop() primaryColor?: string = '#10b981';
  @Prop() size?: 'small' | 'medium' | 'large' = 'medium';
  @State() animationFrame: number = 0;

  private canvasRef?: HTMLCanvasElement;
  private rafId: number | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  componentDidLoad() {
    this.setupCanvas();
    this.startAnimation();
  }

  disconnectedCallback() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private setupCanvas() {
    if (!this.canvasRef) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvasRef.getBoundingClientRect();
    this.canvasRef.width = rect.width * dpr;
    this.canvasRef.height = rect.height * dpr;
    this.ctx = this.canvasRef.getContext('2d');
    if (this.ctx) this.ctx.scale(dpr, dpr);
  }

  private startAnimation() {
    const animate = () => {
      this.drawOrb();
      this.rafId = requestAnimationFrame(animate);
    };
    animate();
  }

  private drawOrb() {
    if (!this.ctx || !this.canvasRef) return;
    const width = this.canvasRef.clientWidth;
    const height = this.canvasRef.clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) / 2 - 4;
    this.ctx.clearRect(0, 0, width, height);
    const combinedVolume = Math.max(this.inputVolume, this.outputVolume);
    const pulse = this.isActive ? 1 + combinedVolume * 0.15 : 1;
    const radius = baseRadius * pulse;
    const color = this.hexToRgb(this.primaryColor || '#10b981');

    if (this.isActive && combinedVolume > 0.1) {
      const glowRadius = radius + 10 + combinedVolume * 20;
      const gradient = this.ctx.createRadialGradient(centerX, centerY, radius, centerX, centerY, glowRadius);
      gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.3 * combinedVolume})`);
      gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
    }

    const orbGradient = this.ctx.createRadialGradient(centerX - radius * 0.3, centerY - radius * 0.3, 0, centerX, centerY, radius);
    if (this.isActive) {
      orbGradient.addColorStop(0, `rgba(${color.r + 40}, ${color.g + 40}, ${color.b + 40}, 1)`);
      orbGradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, 1)`);
      orbGradient.addColorStop(1, `rgba(${Math.max(0, color.r - 30)}, ${Math.max(0, color.g - 30)}, ${Math.max(0, color.b - 30)}, 1)`);
    } else {
      orbGradient.addColorStop(0, '#6b7280');
      orbGradient.addColorStop(0.5, '#4b5563');
      orbGradient.addColorStop(1, '#374151');
    }
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = orbGradient;
    this.ctx.fill();

    const highlightGradient = this.ctx.createRadialGradient(centerX - radius * 0.3, centerY - radius * 0.3, 0, centerX - radius * 0.3, centerY - radius * 0.3, radius * 0.6);
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = highlightGradient;
    this.ctx.fill();

    if (this.isActive) {
      this.animationFrame++;
      for (let i = 0; i < 3; i++) {
        const phase = (this.animationFrame * 0.02 + i / 3) % 1;
        const ringRadius = radius + phase * 30;
        const alpha = (1 - phase) * 0.3 * combinedVolume;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
        this.ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 16, g: 185, b: 129 };
  }

  render() {
    return (
      <div class={`orb orb--${this.size} ${this.isActive ? 'orb--active' : ''}`}>
        <canvas ref={(el) => (this.canvasRef = el)} class="orb__canvas" />
      </div>
    );
  }
}
