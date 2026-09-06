import { IAudioPlayer } from "./IAudioPlayer";

/**
 * A standard implementation of IAudioPlayer utilizing the HTML5 Web Audio API
 * and HTMLAudioElement for low-latency sound effects and streaming background music.
 *
 * @remarks
 * Includes volume control, low-latency AudioBuffer caching, and panning/attenuation
 * for spatial audio positioning. Safe to initialize in non-browser (headless/Node) environments.
 * @public
 */
export class WebAudioPlayer implements IAudioPlayer {
  private ctx: AudioContext | null = null;
  private sfxCache = new Map<string, AudioBuffer>();
  private bgmAudio: HTMLAudioElement | null = null;
  private currentBgmUrl: string | null = null;

  private masterVolumeNode: GainNode | null = null;
  private sfxVolumeNode: GainNode | null = null;
  private bgmVolumeNode: GainNode | null = null;

  private masterVolume = 1.0;
  private sfxVolume = 1.0;
  private bgmVolume = 1.0;

  constructor() {
    this.initContext();
  }

  /**
   * Safely initializes the AudioContext and connected GainNode routing graph.
   */
  private initContext(): void {
    if (typeof window === "undefined") return;

    const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = win.AudioContext || win.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      this.ctx = new AudioContextClass();
      if (this.ctx.state === "closed") {
        this.ctx = null;
        return;
      }

      this.masterVolumeNode = this.ctx.createGain();
      this.sfxVolumeNode = this.ctx.createGain();
      this.bgmVolumeNode = this.ctx.createGain();

      this.masterVolumeNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.sfxVolumeNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.bgmVolumeNode.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);

      // Route: SFX & BGM -> Master -> Destination
      this.sfxVolumeNode.connect(this.masterVolumeNode);
      this.bgmVolumeNode.connect(this.masterVolumeNode);
      this.masterVolumeNode.connect(this.ctx.destination);

      this.ctx.onstatechange = () => {
        if (this.ctx && this.ctx.state === "closed") {
          this.ctx = null;
        }
      };
    } catch (e) {
      console.warn("[WebAudioPlayer] Failed to initialize AudioContext:", e);
      this.ctx = null;
    }
  }

  /**
   * Resumes the AudioContext if it has been suspended by browser autoplay policies,
   * or re-initializes it if closed.
   */
  private resumeContext(): void {
    if (typeof window === "undefined") return;

    if (!this.ctx || this.ctx.state === "closed") {
      this.initContext();
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Creates and caches a silent dummy AudioBuffer fallback when audio loading or decoding fails.
   */
  private createFallbackBuffer(id: string): void {
    if (!this.ctx) return;
    try {
      const sampleRate = this.ctx.sampleRate || 44100;
      const dummyBuffer = this.ctx.createBuffer(1, sampleRate, sampleRate);
      this.sfxCache.set(id, dummyBuffer);
    } catch (dummyErr) {
      // Safe catch for invalid/closed context states
    }
  }

  /**
   * Loads an audio file and caches it as an AudioBuffer for low-latency playback.
   */
  public async loadSFX(id: string, options: unknown): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    this.resumeContext();
    if (!this.ctx || this.ctx.state === "closed") {
      return;
    }

    const url = typeof options === "string" ? options : id;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[WebAudioPlayer] HTTP error loading "${id}" from "${url}": status ${response.status}`);
        this.createFallbackBuffer(id);
        return;
      }

      const contentType = response.headers?.get ? response.headers.get("content-type") : null;
      if (contentType && contentType.toLowerCase().includes("text/html")) {
        console.warn(`[WebAudioPlayer] Skipping audio decoding for "${id}" as response was HTML (404 route fallback)`);
        this.createFallbackBuffer(id);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        console.warn(`[WebAudioPlayer] Empty buffer received for "${id}" from "${url}"`);
        this.createFallbackBuffer(id);
        return;
      }

      const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
        if (!this.ctx) {
          reject(new Error("AudioContext missing"));
          return;
        }
        try {
          const res = this.ctx.decodeAudioData(
            arrayBuffer,
            (buf) => resolve(buf),
            (err) => reject(err)
          );
          if (res && typeof (res as Promise<AudioBuffer>).then === "function") {
            (res as Promise<AudioBuffer>).then(resolve).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      });

      this.sfxCache.set(id, audioBuffer);
    } catch (e) {
      console.warn(`[WebAudioPlayer] Failed to load/decode audio for "${id}" from "${url}":`, e);
      this.createFallbackBuffer(id);
    }
  }

  /**
   * Plays a cached sound effect with low latency.
   */
  public playSFX(id: string, _options?: unknown): void {
    this.resumeContext();
    if (!this.ctx || this.ctx.state === "closed" || !this.sfxVolumeNode) return;

    const buffer = this.sfxCache.get(id);
    if (!buffer) {
      return;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.sfxVolumeNode);
      source.start();
    } catch (e) {
      console.warn(`[WebAudioPlayer] Error playing SFX "${id}":`, e);
    }
  }

  /**
   * Plays background music. Uses HTMLAudioElement for efficient streaming.
   */
  public playBGM(id: string, options?: unknown): void {
    this.resumeContext();
    if (typeof window === "undefined") return;

    const url = typeof options === "string" ? options : id;
    if (this.currentBgmUrl === url && this.bgmAudio) {
      this.bgmAudio.play().catch(() => {});
      return;
    }

    this.stopBGM();

    try {
      this.currentBgmUrl = url;
      this.bgmAudio = new Audio(url);
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this.masterVolume * this.bgmVolume;
      this.bgmAudio.play().catch((e) => {
        console.warn("[WebAudioPlayer] Playback of BGM was interrupted or prevented:", e);
      });
    } catch (e) {
      console.warn(`[WebAudioPlayer] Failed to play BGM "${url}":`, e);
    }
  }

  /**
   * Stops background music playback.
   */
  public stopBGM(): void {
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
        this.bgmAudio.currentTime = 0;
      } catch (e) {
        // Safe catch for invalid DOM states
      }
    }
    this.currentBgmUrl = null;
    this.bgmAudio = null;
  }

  /**
   * Pauses background music playback.
   */
  public pauseBGM(): void {
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
      } catch (e) {
        // Safe catch
      }
    }
  }

  /**
   * Sets the master volume level (0.0 to 1.0).
   */
  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.ctx.state !== "closed" && this.masterVolumeNode) {
      try {
        this.masterVolumeNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      } catch (e) {
        // Safe catch
      }
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.masterVolume * this.bgmVolume;
    }
  }

  /**
   * Sets the sound effects (SFX) volume level (0.0 to 1.0).
   */
  public setSFXVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.ctx.state !== "closed" && this.sfxVolumeNode) {
      try {
        this.sfxVolumeNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      } catch (e) {
        // Safe catch
      }
    }
  }

  /**
   * Sets the background music (BGM) volume level (0.0 to 1.0).
   */
  public setBGMVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.ctx.state !== "closed" && this.bgmVolumeNode) {
      try {
        this.bgmVolumeNode.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
      } catch (e) {
        // Safe catch
      }
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.masterVolume * this.bgmVolume;
    }
  }

  /**
   * Plays a sound effect with spatial panning and volume attenuation based on listener position.
   */
  public playSpatialSFX(
    id: string,
    x: number,
    y: number,
    listenerX: number,
    listenerY: number,
    maxDistance: number
  ): void {
    this.resumeContext();
    if (!this.ctx || this.ctx.state === "closed" || !this.sfxVolumeNode) return;

    const buffer = this.sfxCache.get(id);
    if (!buffer) return;

    try {
      const dx = x - listenerX;
      const dy = y - listenerY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxDistance) return;

      const volume = 1.0 - distance / maxDistance;
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);

      const pan = maxDistance > 0 ? dx / maxDistance : 0;
      const clampedPan = Math.max(-1, Math.min(1, pan));

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      let lastNode: AudioNode = gainNode;
      if (typeof this.ctx.createStereoPanner === "function") {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(clampedPan, this.ctx.currentTime);
        gainNode.connect(panner);
        lastNode = panner;
      }

      source.connect(gainNode);
      lastNode.connect(this.sfxVolumeNode);
      source.start();
    } catch (e) {
      console.warn(`[WebAudioPlayer] Error playing spatial SFX "${id}":`, e);
    }
  }
}
