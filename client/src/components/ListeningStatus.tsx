import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ListeningStatusProps {
  isListening: boolean;
  isRecording: boolean;
  isInitializing?: boolean;
}

export function ListeningStatus({
  isListening,
  isRecording,
  isInitializing,
}: ListeningStatusProps) {
  return (
    <div className="flex gap-2">
      <Badge variant={isListening ? "default" : "secondary"}>
        {isListening ? 'Listening' : 'Not Listening'}
      </Badge>
      {isInitializing && (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
          Initializing...
        </Badge>
      )}
      {isListening && !isInitializing && (
        <Badge 
          variant={isRecording ? "destructive" : "default"}
          className={cn(
            isRecording && "animate-pulse"
          )}
        >
          {isRecording ? 'Recording' : 'Ready for voice'}
        </Badge>
      )}
    </div>
  );
}
