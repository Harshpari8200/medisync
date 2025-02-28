"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X } from 'lucide-react';

interface VideoCallFrameProps {
  roomUrl: string;
  token: string;
  onLeave: () => void;
}

export function VideoCall({ roomUrl, token, onLeave }: VideoCallFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // This component is now just a fallback for Daily.co
    // It should be replaced by the new 100ms implementation
    console.warn("Using legacy Daily.co component - please use the new 100ms implementation");
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Video Call</h2>
        <Button variant="ghost" size="sm" onClick={onLeave}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>
      </div>
      <div className="flex-1 bg-black rounded-lg overflow-hidden">
        <iframe
          ref={iframeRef}
          src={`${roomUrl}?token=${token}`}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="w-full h-full border-0"
          title="Video call"
        />
      </div>
    </div>
  );
}
