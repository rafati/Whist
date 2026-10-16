import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './socketContext.tsx';
import { Seat, ServerMessage, UserProfile, VoicePeer } from '../types.ts';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// Speaking threshold in RMS units
const SPEAKING_RMS_THRESHOLD = 0.02;

export interface UseVoiceChatOptions {
  roomId: string;
  user: UserProfile;
  seat: Seat | null;
}

export function useVoiceChat({ roomId, user, seat }: UseVoiceChatOptions) {
  const { addSocketListener, sendClientMessage, isConnected } = useSocket();

  const [isInVoice, setIsInVoice] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);

  // Unique peer identifier for this session
  const peerIdRef = useRef<string>(user.id);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Web Audio Context & Analyser for speaking indicator
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeakingStateRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio container in DOM
  const audioContainerRef = useRef<HTMLDivElement | null>(null);

  // Keep state refs for async callbacks
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;

  const isInVoiceRef = useRef(isInVoice);
  isInVoiceRef.current = isInVoice;

  // Initialize hidden audio container on mount
  useEffect(() => {
    let container = document.getElementById('voice-audio-container') as HTMLDivElement | null;
    if (!container) {
      container = document.createElement('div');
      container.id = 'voice-audio-container';
      container.style.display = 'none';
      document.body.appendChild(container);
    }
    audioContainerRef.current = container;

    return () => {
      // Audio tracks stopped during leaveVoice()
    };
  }, []);

  // Helper to attach remote audio stream
  const attachRemoteAudio = useCallback((remotePeerId: string, stream: MediaStream) => {
    let audio = remoteAudiosRef.current.get(remotePeerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.muted = isDeafenedRef.current;
      audio.volume = isDeafenedRef.current ? 0 : 1;
      if (audioContainerRef.current) {
        audioContainerRef.current.appendChild(audio);
      }
      remoteAudiosRef.current.set(remotePeerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch((err) => {
      console.warn(`Autoplay audio for peer ${remotePeerId} caught:`, err);
    });
  }, []);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback((remotePeerId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remotePeerId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(remotePeerId, pc);

    // Add local tracks if we have mic stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendClientMessage({
          type: 'voice_signal',
          roomId,
          fromPeerId: peerIdRef.current,
          toPeerId: remotePeerId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
      }
    };

    // Remote Track handler
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        attachRemoteAudio(remotePeerId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.log(`WebRTC connection to ${remotePeerId} is ${pc.connectionState}`);
      }
    };

    return pc;
  }, [roomId, sendClientMessage, attachRemoteAudio]);

  // Clean up single peer connection
  const closePeerConnection = useCallback((remotePeerId: string) => {
    const pc = peerConnectionsRef.current.get(remotePeerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(remotePeerId);
    }
    pendingCandidatesRef.current.delete(remotePeerId);

    const audio = remoteAudiosRef.current.get(remotePeerId);
    if (audio) {
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      remoteAudiosRef.current.delete(remotePeerId);
    }
  }, []);

  // Set up local speech volume detection
  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);

      speakingCheckIntervalRef.current = setInterval(() => {
        if (!isInVoiceRef.current || isMutedRef.current || isDeafenedRef.current) {
          if (lastSpeakingStateRef.current) {
            lastSpeakingStateRef.current = false;
            setIsSpeaking(false);
            sendClientMessage({
              type: 'voice_speaking',
              roomId,
              peerId: peerIdRef.current,
              isSpeaking: false,
            });
          }
          return;
        }

        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          sumSquares += buffer[i] * buffer[i];
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const currentlySpeaking = rms > SPEAKING_RMS_THRESHOLD;

        if (currentlySpeaking) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          if (!lastSpeakingStateRef.current) {
            lastSpeakingStateRef.current = true;
            setIsSpeaking(true);
            sendClientMessage({
              type: 'voice_speaking',
              roomId,
              peerId: peerIdRef.current,
              isSpeaking: true,
            });
          }
        } else if (lastSpeakingStateRef.current && !silenceTimerRef.current) {
          // Delay turning off speaking by 300ms to avoid flicker
          silenceTimerRef.current = setTimeout(() => {
            lastSpeakingStateRef.current = false;
            setIsSpeaking(false);
            sendClientMessage({
              type: 'voice_speaking',
              roomId,
              peerId: peerIdRef.current,
              isSpeaking: false,
            });
            silenceTimerRef.current = null;
          }, 350);
        }
      }, 100);
    } catch (e) {
      console.warn('Audio analysis setup warning:', e);
    }
  }, [roomId, sendClientMessage]);

  // Stop volume analysis
  const stopVolumeAnalysis = useCallback(() => {
    if (speakingCheckIntervalRef.current) {
      clearInterval(speakingCheckIntervalRef.current);
      speakingCheckIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    lastSpeakingStateRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Join Voice Chat
  const joinVoice = useCallback(async () => {
    setPermissionError(null);
    setIsConnecting(true);

    try {
      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      // 2. Start speech activity analyser
      startVolumeAnalysis(stream);

      // 3. Register with server
      sendClientMessage({
        type: 'voice_join',
        roomId,
        peerId: peerIdRef.current,
        user,
        seat,
      });

      setIsInVoice(true);
      setIsConnecting(false);
      setIsMuted(false);
      setIsDeafened(false);
    } catch (err: any) {
      console.error('Microphone access denied or failed:', err);
      setIsConnecting(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError('Microphone permission was denied. Please allow microphone access in your browser to talk.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setPermissionError('No microphone found on your device.');
      } else {
        setPermissionError('Could not start microphone: ' + (err.message || 'unknown error'));
      }
    }
  }, [roomId, user, seat, sendClientMessage, startVolumeAnalysis]);

  // Leave Voice Chat
  const leaveVoice = useCallback(() => {
    if (isInVoiceRef.current) {
      sendClientMessage({
        type: 'voice_leave',
        roomId,
        peerId: peerIdRef.current,
      });
    }

    // Stop microphone tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close all WebRTC peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    // Remove remote audios
    remoteAudiosRef.current.forEach((audio) => {
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    });
    remoteAudiosRef.current.clear();

    stopVolumeAnalysis();
    setIsInVoice(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setPeers([]);
  }, [roomId, sendClientMessage, stopVolumeAnalysis]);

  // Toggle Mute Local Mic
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMutedRef.current;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);

    if (nextMuted) {
      setIsSpeaking(false);
    }

    sendClientMessage({
      type: 'voice_status',
      roomId,
      peerId: peerIdRef.current,
      isMuted: nextMuted,
      isDeafened: isDeafenedRef.current,
    });
  }, [roomId, sendClientMessage]);

  // Toggle Deafen (mute incoming audio + mute mic)
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafenedRef.current;
    setIsDeafened(nextDeafened);

    // Mute/unmute all remote audio elements
    remoteAudiosRef.current.forEach((audio) => {
      audio.muted = nextDeafened;
      audio.volume = nextDeafened ? 0 : 1;
    });

    // When deafened, also mute local mic
    if (nextDeafened && !isMutedRef.current) {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setIsMuted(true);
      setIsSpeaking(false);
    }

    sendClientMessage({
      type: 'voice_status',
      roomId,
      peerId: peerIdRef.current,
      isMuted: nextDeafened ? true : isMutedRef.current,
      isDeafened: nextDeafened,
    });
  }, [roomId, sendClientMessage]);

  // Handle incoming WebRTC signaling messages
  useEffect(() => {
    const removeListener = addSocketListener(async (msg: ServerMessage) => {
      // 1. Existing peers list received after joining
      if (msg.type === 'voice_peers_list' && msg.roomId === roomId) {
        // Exclude self from remote peers
        const remotePeers = msg.peers.filter((p) => p.peerId !== peerIdRef.current);
        setPeers(remotePeers);

        // Initiate WebRTC offers for peers where our peerId is lexicographically greater
        // (Deterministic polite tie-breaker to avoid offer glare)
        for (const remotePeer of remotePeers) {
          if (peerIdRef.current > remotePeer.peerId) {
            const pc = createPeerConnection(remotePeer.peerId);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendClientMessage({
                type: 'voice_signal',
                roomId,
                fromPeerId: peerIdRef.current,
                toPeerId: remotePeer.peerId,
                signal: { type: 'offer', sdp: offer },
              });
            } catch (err) {
              console.error(`Error creating offer for ${remotePeer.peerId}:`, err);
            }
          }
        }
      }

      // 2. New remote peer joined the room
      if (msg.type === 'voice_peer_joined' && msg.roomId === roomId) {
        if (msg.peer.peerId === peerIdRef.current) return;

        setPeers((prev) => {
          const filtered = prev.filter((p) => p.peerId !== msg.peer.peerId);
          return [...filtered, msg.peer];
        });

        // The newcomer or higher peerId initiates the offer
        if (peerIdRef.current > msg.peer.peerId) {
          const pc = createPeerConnection(msg.peer.peerId);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendClientMessage({
              type: 'voice_signal',
              roomId,
              fromPeerId: peerIdRef.current,
              toPeerId: msg.peer.peerId,
              signal: { type: 'offer', sdp: offer },
            });
          } catch (err) {
            console.error(`Error creating offer for new peer ${msg.peer.peerId}:`, err);
          }
        }
      }

      // 3. Remote peer left the room
      if (msg.type === 'voice_peer_left' && msg.roomId === roomId) {
        setPeers((prev) => prev.filter((p) => p.peerId !== msg.peerId));
        closePeerConnection(msg.peerId);
      }

      // 4. Remote peer updated mute/deafen status
      if (msg.type === 'voice_peer_status' && msg.roomId === roomId) {
        setPeers((prev) =>
          prev.map((p) =>
            p.peerId === msg.peerId
              ? {
                  ...p,
                  isMuted: msg.isMuted,
                  isDeafened: msg.isDeafened,
                  isSpeaking: msg.isMuted ? false : p.isSpeaking,
                }
              : p
          )
        );
      }

      // 5. Remote peer speech activity indicator
      if (msg.type === 'voice_peer_speaking' && msg.roomId === roomId) {
        setPeers((prev) =>
          prev.map((p) => (p.peerId === msg.peerId ? { ...p, isSpeaking: msg.isSpeaking } : p))
        );
      }

      // 6. WebRTC Signaling (Offer / Answer / ICE Candidate)
      if (msg.type === 'voice_signal' && msg.roomId === roomId && msg.toPeerId === peerIdRef.current) {
        const { fromPeerId, signal } = msg;
        const pc = createPeerConnection(fromPeerId);

        try {
          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued candidates if any
            const queued = pendingCandidatesRef.current.get(fromPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            pendingCandidatesRef.current.delete(fromPeerId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendClientMessage({
              type: 'voice_signal',
              roomId,
              fromPeerId: peerIdRef.current,
              toPeerId: fromPeerId,
              signal: { type: 'answer', sdp: answer },
            });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued candidates if any
            const queued = pendingCandidatesRef.current.get(fromPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            pendingCandidatesRef.current.delete(fromPeerId);
          } else if (signal.type === 'candidate' && signal.candidate) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              // Queue candidate until remote description is set
              const queue = pendingCandidatesRef.current.get(fromPeerId) || [];
              queue.push(signal.candidate);
              pendingCandidatesRef.current.set(fromPeerId, queue);
            }
          }
        } catch (signalErr) {
          console.error(`Signaling processing error with ${fromPeerId}:`, signalErr);
        }
      }
    });

    return () => {
      removeListener();
    };
  }, [addSocketListener, createPeerConnection, closePeerConnection, roomId, sendClientMessage]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [leaveVoice]);

  return {
    isInVoice,
    isConnecting,
    isMuted,
    isDeafened,
    isSpeaking,
    permissionError,
    clearPermissionError: () => setPermissionError(null),
    peers,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
  };
}
