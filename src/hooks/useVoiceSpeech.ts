import { useState, useEffect, useRef, useCallback } from 'react';
import { FamilyMember } from '../types';

interface VoiceIntentResult {
  rawTranscript: string;
  cleanedPrompt: string;
  detectedAttendeeIds?: string[];
  detectedMode?: 'all' | 'self' | 'specific';
  shouldAutoGenerate?: boolean;
}

export function useVoiceSpeech(familyMembers: FamilyMember[] = []) {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vastrakalp_tts_enabled') === 'true';
    } catch {
      return false;
    }
  });

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize browser speech recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            currentFinal += result[0].transcript;
          } else {
            currentInterim += result[0].transcript;
          }
        }

        if (currentFinal) {
          setTranscript((prev) => (prev ? `${prev} ${currentFinal}` : currentFinal).trim());
        }
        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. Please allow microphone access in your browser.');
        } else if (event.error === 'no-speech') {
          // Soft ignore silence
        } else if (event.error === 'network') {
          setError('Network issue detected with speech recognition service.');
        } else {
          setError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        stopAudioAnalysis();
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Failed to initialize speech recognition:', e);
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      stopAudioAnalysis();
    };
  }, []);

  // Web Audio Visualizer Analysis
  const startAudioAnalysis = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      console.warn('Audio visualization analyser could not start:', err);
    }
  };

  const stopAudioAnalysis = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  };

  // Start Voice Listening
  const startListening = useCallback(async () => {
    setError(null);
    setTranscript('');
    setInterimTranscript('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        await startAudioAnalysis();
      } catch (err: any) {
        console.warn('Recognition start exception:', err);
        if (err.name === 'InvalidStateError') {
          // Already active, restart
          recognitionRef.current.stop();
        }
      }
    } else {
      setError('Voice recognition is not supported on this device/browser.');
    }
  }, []);

  // Stop Voice Listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    stopAudioAnalysis();
  }, [isListening]);

  // Toggle Voice Listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Smart Intent & Entity Parser
  const parseVoiceIntent = useCallback(
    (spokenText: string): VoiceIntentResult => {
      const text = spokenText.trim();
      const lower = text.toLowerCase();

      let detectedMode: 'all' | 'self' | 'specific' = 'all';
      let detectedAttendeeIds: string[] = ['self'];
      let shouldAutoGenerate = false;

      // Detect auto generation triggers
      if (
        /style (them|us|it|now|outfit|group)|generate (now|it|outfits?)|plan (it|now)/i.test(lower)
      ) {
        shouldAutoGenerate = true;
      }

      // 1. Detect "everyone" / "all of us" / "whole family"
      if (
        /for everyone|for all of us|all family|whole family|for the family|entire family/i.test(
          lower
        )
      ) {
        detectedMode = 'all';
        detectedAttendeeIds = ['self', ...familyMembers.map((m) => m.id)];
      }
      // 2. Detect "just me" / "only me" / "myself"
      else if (/just me|only me|for myself|for me only|single outfit|just for me/i.test(lower)) {
        detectedMode = 'self';
        detectedAttendeeIds = ['self'];
      }
      // 3. Detect specific named family members
      else if (familyMembers.length > 0) {
        const matchedIds = new Set<string>();

        // Always check if "me" or "I" is involved
        if (/\b(me|myself|i)\b/i.test(lower) || !/\bfor\b/i.test(lower)) {
          matchedIds.add('self');
        }

        familyMembers.forEach((member) => {
          const nameMatch = member.name && new RegExp(`\\b${member.name}\\b`, 'i').test(lower);
          const rel = (member.relation || member.relationship || '').toLowerCase();
          const relMatch =
            rel &&
            (new RegExp(`\\b${rel}\\b`, 'i').test(lower) ||
              (rel === 'partner' && /\b(wife|husband|spouse|partner|fiancee?)\b/i.test(lower)) ||
              (rel === 'child' && /\b(son|daughter|kid|baby|child)\b/i.test(lower)) ||
              (rel === 'parent' && /\b(mom|dad|mother|father|parents?)\b/i.test(lower)) ||
              (rel === 'sibling' && /\b(brother|sister|bro|sis)\b/i.test(lower)));

          if (nameMatch || relMatch) {
            matchedIds.add(member.id);
          }
        });

        if (matchedIds.size > 0) {
          detectedMode = 'specific';
          detectedAttendeeIds = Array.from(matchedIds);
        }
      }

      // Clean prompt from voice assistant prefixes & commands
      let cleaned = text
        .replace(
          /^(hey vastrakalp|alexa|siri|ok google|please|vastrakalp|can you|help me)\s+/i,
          ''
        )
        .replace(
          /^(plan an outfit for|plan clothes for|style us for|style me for|what should we wear to|what to wear for|suggest clothes for|suggest outfits? for|outfit for|clothes for)\s+/i,
          ''
        )
        .replace(
          /\b(for (everyone|all of us|the whole family|just me|only me|me and \w+|for \w+ and \w+))\b/gi,
          ''
        )
        .replace(
          /\b(and style (us|them|it|now)|and generate (now|it)|please style now)\b/gi,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim();

      if (!cleaned && text) {
        cleaned = text; // fallback to original if over-cleaned
      }

      return {
        rawTranscript: text,
        cleanedPrompt: cleaned,
        detectedAttendeeIds,
        detectedMode,
        shouldAutoGenerate,
      };
    },
    [familyMembers]
  );

  // Text-To-Speech (TTS) Voice Synthesis
  const speakText = useCallback((textToSpeak: string) => {
    if (!('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel(); // Stop prior speech
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;

      // Pick natural sounding voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Karen')) &&
          v.lang.startsWith('en')
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsSpeaking(false);
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vastrakalp_tts_enabled', String(next));
      } catch {}
      if (!next) {
        stopSpeaking();
      }
      return next;
    });
  }, [stopSpeaking]);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    audioLevel,
    error,
    startListening,
    stopListening,
    toggleListening,
    parseVoiceIntent,
    speakText,
    stopSpeaking,
    isSpeaking,
    ttsEnabled,
    toggleTts,
    clearTranscript: () => {
      setTranscript('');
      setInterimTranscript('');
    },
  };
}
