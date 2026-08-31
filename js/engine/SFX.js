// --- Web Audio SFX Engine with Rich Synthesized Sound Effects ---
const SFX = {
  ctx: null,
  enabled: true,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggle() {
    this.enabled = !this.enabled;
    const btn = document.getElementById('btn-audio');
    if (btn) btn.innerText = this.enabled ? '🔊' : '🔇';
    return this.enabled;
  },

  playTone(freq, type, duration, gainStart = 0.15, gainEnd = 0.001) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainStart, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(gainEnd, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) { }
  },

  playClick() { this.playTone(800, 'sine', 0.05, 0.1); },
  
  playHatchOpen() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(450, this.ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (e) { }
  },

  activeBeams: {},

  startContinuousBeam(id = 'default', type = 'laser') {
    if (!this.enabled || !this.ctx) return;
    if (this.activeBeams[id]) return; // Already streaming

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator(); // Bass fundamental
      const osc2 = this.ctx.createOscillator(); // Harmonic plasma hum
      const lfo = this.ctx.createOscillator();  // Subtle plasma energy modulation
      const lfoGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      if (type === 'drill') {
        // Deep thermal core rumble
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(85, now);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(170, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(280, now);
        filter.Q.setValueAtTime(3.2, now);
      } else if (type === 'mine') {
        // Diagonal plasma cutter hum
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(115, now);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(230, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(380, now);
        filter.Q.setValueAtTime(3.8, now);
      } else {
        // Star Wars lightsaber / plasma sustained cutting beam hum (Vzzzhhwoooom)
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(130, now);
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(260, now);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        filter.Q.setValueAtTime(4.2, now);
      }

      // Subtle 4Hz LFO for realistic sci-fi plasma beam vibration
      lfo.frequency.setValueAtTime(4.2, now);
      lfoGain.gain.setValueAtTime(3.0, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      // Smooth attack ramp (no sudden clicking)
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.05);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      lfo.start(now);

      this.activeBeams[id] = { osc1, osc2, lfo, gain, filter };
    } catch(e) { }
  },

  stopContinuousBeam(id = 'default') {
    const beam = this.activeBeams[id];
    if (!beam || !this.ctx) return;
    delete this.activeBeams[id];

    try {
      const now = this.ctx.currentTime;
      beam.gain.gain.cancelScheduledValues(now);
      beam.gain.gain.setValueAtTime(beam.gain.gain.value, now);
      beam.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

      setTimeout(() => {
        try {
          beam.osc1.stop();
          beam.osc2.stop();
          beam.lfo.stop();
          beam.osc1.disconnect();
          beam.osc2.disconnect();
          beam.gain.disconnect();
        } catch(e) {}
      }, 140);
    } catch(e) {}
  },

  stopAllContinuousBeams() {
    for (const id in this.activeBeams) {
      this.stopContinuousBeam(id);
    }
  },

  playLaser() { this.startContinuousBeam('temp_laser', 'laser'); setTimeout(() => this.stopContinuousBeam('temp_laser'), 250); },
  playDrill() { this.startContinuousBeam('temp_drill', 'drill'); setTimeout(() => this.stopContinuousBeam('temp_drill'), 250); },
  playMine() { this.startContinuousBeam('temp_mine', 'mine'); setTimeout(() => this.stopContinuousBeam('temp_mine'), 250); },

  playExplosion() {
    if (!this.enabled || !this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 0.4;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.4);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      whiteNoise.start();
    } catch (e) { }
  },

  playBuild() { this.playTone(550, 'square', 0.08, 0.08); },
  playShield() { this.playTone(440, 'sine', 0.25, 0.18); },
  
  playTeleport() {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch (e) { }
  },

  playSplat() {
    if (!this.enabled || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      
      // Cute Chibi/Dwarf falling scream & comical thud ("Waaah-eek! / 삐약~ 쿵!")
      const voiceOsc = this.ctx.createOscillator();
      const vibratoOsc = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      const voiceFilter = this.ctx.createBiquadFilter();
      const voiceGain = this.ctx.createGain();

      // Vocal formant modulation (High comical scream gliding down)
      voiceOsc.type = 'sawtooth';
      voiceOsc.frequency.setValueAtTime(820, now);
      voiceOsc.frequency.linearRampToValueAtTime(960, now + 0.06); // Cute high-pitch yelp start
      voiceOsc.frequency.exponentialRampToValueAtTime(260, now + 0.28); // Comical slide down

      // Vocal vibrato for cartoon scream feel
      vibratoOsc.frequency.setValueAtTime(16, now);
      vibratoGain.gain.setValueAtTime(25, now);
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(voiceOsc.frequency);

      // Chibi vocal tract filter
      voiceFilter.type = 'bandpass';
      voiceFilter.frequency.setValueAtTime(1400, now);
      voiceFilter.frequency.exponentialRampToValueAtTime(600, now + 0.28);
      voiceFilter.Q.setValueAtTime(2.2, now);

      voiceGain.gain.setValueAtTime(0.01, now);
      voiceGain.gain.linearRampToValueAtTime(0.22, now + 0.04);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      voiceOsc.connect(voiceFilter);
      voiceFilter.connect(voiceGain);
      voiceGain.connect(this.ctx.destination);

      voiceOsc.start(now);
      vibratoOsc.start(now);
      voiceOsc.stop(now + 0.28);
      vibratoOsc.stop(now + 0.28);

      // Soft cute cartoon pop/thud at the end of the fall (0.22s)
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(160, now + 0.22);
      thudOsc.frequency.exponentialRampToValueAtTime(45, now + 0.32);
      thudGain.gain.setValueAtTime(0.18, now + 0.22);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);
      thudOsc.start(now + 0.22);
      thudOsc.stop(now + 0.32);
    } catch(e) {}
  },

  playVictory() {
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sine', 0.3, 0.2), i * 120);
    });
  },

  playDefeat() {
    [400, 350, 300, 220].forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 'sawtooth', 0.35, 0.2), i * 140);
    });
  }
};
