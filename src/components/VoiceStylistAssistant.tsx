import React, { useEffect, useState } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  X, 
  Check, 
  Users, 
  Radio, 
  ArrowRight,
  Info
} from 'lucide-react';
import { FamilyMember } from '../types';

interface VoiceStylistAssistantProps {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  audioLevel: number;
  error: string | null;
  familyMembers: FamilyMember[];
  ttsEnabled: boolean;
  isSpeaking: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onToggleTts: () => void;
  onApplyVoiceIntent: (result: {
    prompt: string;
    attendeeIds: string[];
    autoSubmit: boolean;
  }) => void;
  onStopSpeaking: () => void;
  onParseIntent: (text: string) => {
    rawTranscript: string;
    cleanedPrompt: string;
    detectedAttendeeIds?: string[];
    detectedMode?: 'all' | 'self' | 'specific';
    shouldAutoGenerate?: boolean;
  };
}

export const VoiceStylistAssistant: React.FC<VoiceStylistAssistantProps> = ({
  isListening,
  transcript,
  interimTranscript,
  audioLevel,
  error,
  familyMembers,
  ttsEnabled,
  isSpeaking,
  onStartListening,
  onStopListening,
  onToggleTts,
  onApplyVoiceIntent,
  onStopSpeaking,
  onParseIntent
}) => {
  const [activeHintIndex, setActiveHintIndex] = useState(0);

  const voiceHints = [
    '“Plan a golden hour sunset wedding for everyone”',
    '“Casual Sunday cafe brunch for me and Priya”',
    '“Formal black-tie charity gala for just me”',
    '“Traditional festive Diwali celebration for the whole family”',
    '“Beach resort dinner for me, wife and son and style it”'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHintIndex((prev) => (prev + 1) % voiceHints.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [voiceHints.length]);

  const activeText = (transcript + (interimTranscript ? ` ${interimTranscript}` : '')).trim();
  const parsed = activeText ? onParseIntent(activeText) : null;

  // Resolve member names for detected attendee IDs
  const detectedMemberNames = parsed?.detectedAttendeeIds?.map((id) => {
    if (id === 'self') return 'You';
    const member = familyMembers.find((m) => m.id === id);
    return member?.name || 'Member';
  }) || [];

  return (
    <div className="w-full">
      {/* Listening Waveform Bar & Voice Active Modal */}
      {isListening && (
        <div 
          id="voice-assistant-listening-panel"
          className="mb-4 p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-stone-900 via-stone-950 to-amber-950 text-white shadow-xl border border-amber-500/30 animate-in fade-in slide-in-from-top-3 duration-300 relative overflow-hidden"
        >
          {/* Ambient background glow */}
          <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-1 space-y-4">
            {/* Header with Live Indicator & Controls */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center">
                  <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping absolute" />
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 relative" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-wide text-amber-200 uppercase font-sans">
                    Vastrakalp Voice Assistant
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 font-medium">
                    Listening Live
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleTts}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border ${
                    ttsEnabled
                      ? 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                      : 'bg-white/5 text-stone-400 border-white/10 hover:text-white'
                  }`}
                  title={ttsEnabled ? 'Voice Guidance Active' : 'Voice Guidance Muted'}
                >
                  {ttsEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{ttsEnabled ? 'Audio Feedback On' : 'Audio Feedback Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={onStopListening}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white transition"
                  title="Close Voice Assistant"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Audio Waveform Equalizer Visualizer */}
            <div className="flex items-center justify-center gap-1.5 py-2">
              {[40, 70, 100, 60, 90, 45, 80, 55, 95, 65, 85, 50, 75, 35].map((baseHeight, i) => {
                const dynamicHeight = Math.max(
                  12,
                  Math.min(48, Math.round((baseHeight * (audioLevel + 30)) / 100))
                );
                return (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-amber-500 to-rose-400 transition-all duration-75"
                    style={{
                      height: `${dynamicHeight}px`,
                      opacity: audioLevel > 5 ? 0.95 : 0.45,
                    }}
                  />
                );
              })}
            </div>

            {/* Live Transcript Display */}
            <div className="bg-black/30 rounded-2xl p-3.5 border border-white/10 min-h-[56px] flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {activeText ? (
                  <p className="text-sm font-medium text-stone-100 leading-relaxed break-words">
                    <span className="text-amber-300">“</span>
                    {transcript}
                    {interimTranscript && (
                      <span className="text-amber-300/80 italic animate-pulse">
                        {transcript ? ` ${interimTranscript}` : interimTranscript}
                      </span>
                    )}
                    <span className="text-amber-300">”</span>
                  </p>
                ) : (
                  <p className="text-xs text-stone-400 italic flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    Speak now into your microphone... (e.g., event name, who is attending)
                  </p>
                )}
              </div>

              {activeText && (
                <button
                  type="button"
                  onClick={() => {
                    if (parsed) {
                      onStopListening();
                      onApplyVoiceIntent({
                        prompt: parsed.cleanedPrompt || parsed.rawTranscript,
                        attendeeIds: parsed.detectedAttendeeIds || ['self'],
                        autoSubmit: true
                      });
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 transition shrink-0 shadow-md cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Style Now</span>
                </button>
              )}
            </div>

            {/* Smart Intent Entity Preview (Attendees + Prompt) */}
            {parsed && parsed.cleanedPrompt && (
              <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 border border-white/10 text-stone-200">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Detected Attendees: <strong>{detectedMemberNames.join(', ')}</strong> ({detectedMemberNames.length})
                  </span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 border border-white/10 text-stone-200 truncate max-w-md">
                  <Sparkles className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">
                    Occasion: <strong>{parsed.cleanedPrompt}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onStopListening();
                    onApplyVoiceIntent({
                      prompt: parsed.cleanedPrompt,
                      attendeeIds: parsed.detectedAttendeeIds || ['self'],
                      autoSubmit: false
                    });
                  }}
                  className="px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-amber-200 font-semibold transition ml-auto flex items-center gap-1"
                >
                  <span>Insert to Form</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Voice Command Hints Carousel */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-stone-400">
              <div className="flex items-center gap-1.5">
                <Info className="w-3 h-3 text-amber-400/80" />
                <span>Voice Tip:</span>
                <span className="text-amber-200 font-medium transition-all duration-300">
                  {voiceHints[activeHintIndex]}
                </span>
              </div>
              <button
                type="button"
                onClick={onStopListening}
                className="text-stone-400 hover:text-stone-200 underline"
              >
                Stop Listening
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Error Notice */}
      {error && !isListening && (
        <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={onStartListening}
            className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition"
          >
            Try Mic Again
          </button>
        </div>
      )}

      {/* Spoken Text-To-Speech Indicator bar when assistant is reading */}
      {isSpeaking && (
        <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-between text-xs text-amber-950 animate-in fade-in">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-amber-700 animate-pulse" />
            <span className="font-semibold">Vastrakalp Voice Assistant is reading your styling strategy aloud...</span>
          </div>
          <button
            type="button"
            onClick={onStopSpeaking}
            className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded-lg transition"
          >
            Mute Voice
          </button>
        </div>
      )}
    </div>
  );
};
