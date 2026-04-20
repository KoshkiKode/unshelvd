import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: number;
  displayName: string;
  onBlocked?: () => void;
}

export default function BlockDialog({
  open,
  onOpenChange,
  userId,
  displayName,
  onBlocked,
}: BlockDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/blocks", { blockedId: userId });
    },
    onSuccess: () => {
      toast({
        title: "User blocked",
        description: `${displayName} has been blocked. This conversation is now closed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      onOpenChange(false);
      onBlocked?.();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Block {displayName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Blocking this user will close your conversation and prevent either of you
            from starting a new one. This action cannot be undone from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Blocking..." : "Block User"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
