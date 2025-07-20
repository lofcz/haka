import './style.css'

type Bar = {
  x: number;
  y: number;
  width: number;
  height: number;
  targetHeight: number;
  created: number;
  status: 'placeholder' | 'recorded';
}

interface HakaOptions {
  canvas: HTMLCanvasElement;
  timeOffset?: number;
  barWidth?: number;
  barGap?: number;
  scrollSpeed?: number;
  barColor?: string;
  dotColor?: string;
  blackDotColor?: string;
  noiseThreshold?: number;
  easing?: (t: number) => number;
  expandDuration?: number;
}

export default class Haka {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private analyser?: AnalyserNode;
  private frequencyArray?: Float32Array;
  private animationFrameId?: number;

  private bars: Bar[] = [];
  private timeOffset: number;
  private barWidth: number;
  private barGap: number;
  private scrollSpeed: number;
  private barColor: string;
  private dotColor: string;
  private blackDotColor: string;
  private noiseThreshold: number;
  private easing: (t: number) => number;
  private expandDuration: number;
  private lastDataCollectionTime: number = 0;

  constructor(options: HakaOptions) {
    this.canvas = options.canvas;
    this.timeOffset = options.timeOffset || 100;
    this.barWidth = options.barWidth || 3;
    this.barGap = options.barGap || 10;
    this.scrollSpeed = options.scrollSpeed || 1;
    this.barColor = options.barColor || '#FFFFFF';
    this.dotColor = options.dotColor || '#666666';
    this.blackDotColor = options.blackDotColor || '#000000';
    this.noiseThreshold = options.noiseThreshold ?? 0.01;
    this.expandDuration = options.expandDuration || 200;
    this.easing = options.easing || this.easeInOutCubic;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Could not get 2D context from canvas");
    }
    this.ctx = ctx;
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.setupCanvas();
  }

  private setupCanvas() {
    this.width = this.canvas.offsetWidth;
    this.height = this.canvas.offsetHeight;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(dpr, dpr);
  }

  private easeInOutCubic(x: number): number {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  private animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const now = performance.now();
    let lastX = this.width;

    if (this.bars.length > 0) {
        lastX = this.bars[this.bars.length - 1].x;
    }

    if (this.width - lastX >= this.barWidth + this.barGap) {
        if (this.analyser && this.frequencyArray && now - this.lastDataCollectionTime > this.timeOffset) {
            this.lastDataCollectionTime = now;
            this.analyser.getFloatTimeDomainData(this.frequencyArray);
            let max = 0;
            for (let i = 0; i < this.frequencyArray.length; i++) {
                if (this.frequencyArray[i] > max) {
                max = this.frequencyArray[i];
                }
            }
            const barHeight = Math.floor(max * this.height * 1.2);
            this.bars.push({
                x: this.width,
                y: 0, height: 0,
                targetHeight: barHeight,
                created: now,
                status: 'recorded',
                width: this.barWidth
            });
        }
    }


    const minHeight = this.height * this.noiseThreshold;
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const bar = this.bars[i];

      if (bar.status === 'placeholder') {
          this.ctx.fillStyle = this.blackDotColor;
          const dotY = this.height / 2 - 1;
          this.ctx.fillRect(bar.x, dotY, bar.width, 2);
      } else {
          const age = now - bar.created;
          const rawProgress = Math.min(age / this.expandDuration, 1);
          const expandProgress = this.easing(rawProgress);

          bar.height = bar.targetHeight * expandProgress;
          bar.y = (this.height / 2) - (bar.height / 2);

          if (bar.targetHeight < minHeight) {
              this.ctx.fillStyle = this.dotColor;
              const dotY = this.height / 2 - 1;
              this.ctx.fillRect(bar.x, dotY, bar.width, 2);
          } else {
              this.ctx.fillStyle = this.barColor;
              this.ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
          }
      }
      
      bar.x -= this.scrollSpeed;

      if (bar.x + bar.width < 0) {
        this.bars.splice(i, 1);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }


  private soundAllowed(stream: MediaStream) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContent = new AudioContext();
    const streamSource = audioContent.createMediaStreamSource(stream);

    this.analyser = audioContent.createAnalyser();
    streamSource.connect(this.analyser);
    this.analyser.fftSize = 512;
    this.frequencyArray = new Float32Array(this.analyser.fftSize);
    this.lastDataCollectionTime = performance.now();
    this.animate();
  }

  private soundNotAllowed(err: any) {
    console.error('Error getting audio stream:', err);
  }

  public initialize() {
    this.bars = [];
    const visibleSegmentCount = Math.ceil(this.width / (this.barWidth + this.barGap));
    for (let i = 0; i < visibleSegmentCount; i++) {
        this.bars.push({
            x: i * (this.barWidth + this.barGap),
            y: 0, height: 0, targetHeight: 0, created: 0,
            status: 'placeholder',
            width: this.barWidth
        });
    }
    this.drawInitialFrame();
  }

  private drawInitialFrame() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      const dotY = this.height / 2 - 1;
      this.ctx.fillStyle = this.blackDotColor;
      for (const bar of this.bars) {
          this.ctx.fillRect(bar.x, dotY, bar.width, 2);
      }
  }

  public start() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => this.soundAllowed(stream))
      .catch(err => this.soundNotAllowed(err));
  }

  public stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
if (canvas) {
    const haka = new Haka({
        canvas,
        barWidth: 3,
        scrollSpeed: 1,
        barColor: '#FFFFFF',
        dotColor: '#666666',
        blackDotColor: '#000000',
        noiseThreshold: 0.01,
        expandDuration: 200,
    });
    haka.initialize();

    window.addEventListener('click', () => {
        haka.start();
    }, { once: true });
}
