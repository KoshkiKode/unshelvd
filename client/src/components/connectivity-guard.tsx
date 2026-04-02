import { useEffect, useState } from "react";
import { checkBackendHealth } from "@/lib/queryClient";
import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ConnectivityGuard — Runtime server reachability guard
 * 
 * Pings the backend on startup. If unreachable, displays a fullscreen
 * error message until the server becomes available.
 */
export default function ConnectivityGuard({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isReachable, setIsReachable] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function performCheck() {
      setIsChecking(true);
      const healthy = await checkBackendHealth();
      
      if (mounted) {
        setIsReachable(healthy);
        setIsChecking(false);
      }
    }

    performCheck();

    return () => {
      mounted = false;
    };
  }, [retryCount]);

  if (isChecking && retryCount === 0) {
    // Initial check — show children but could also show a loader if preferred
    return <>{children}</>;
  }

  if (!isReachable) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 text-center animate-in fade-in duration-500">
        <div className="max-w-md space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <WifiOff className="h-8 w-8 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-serif font-bold tracking-tight">Offline or Server Unreachable</h2>
            <p className="text-muted-foreground leading-relaxed">
              We couldn't connect to the Unshelv'd server. Please check your internet connection or try again in a moment.
            </p>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <Button 
              onClick={() => setRetryCount(prev => prev + 1)} 
              className="w-full gap-2"
              size="lg"
            >
              <RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? "Checking..." : "Retry Connection"}
            </Button>
            
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
              Attempting to reach: {import.meta.env.VITE_API_URL || "localhost"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
