import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Flag } from "lucide-react";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: number;
  messageId?: number | null;
  conversationId?: number | null;
}

const CATEGORIES = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "scam", label: "Scam / Fraud" },
  { value: "other", label: "Other" },
];

export default function ReportDialog({
  open,
  onOpenChange,
  reportedUserId,
  messageId,
  conversationId,
}: ReportDialogProps) {
  const { toast } = useToast();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reports", {
        reportedUserId,
        messageId: messageId ?? null,
        conversationId: conversationId ?? null,
        category,
        description: description.trim() || null,
      });
    },
    onSuccess: () => {
      toast({ title: "Report submitted", description: "Thank you. We'll review this shortly." });
      setCategory("");
      setDescription("");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Flag className="h-4 w-4" /> Report
          </DialogTitle>
          <DialogDescription>
            Help us keep Unshelv'd safe. Reports are reviewed by our team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="mb-1.5 block">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Additional details (optional)</Label>
            <Textarea
              placeholder="Describe what happened..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => mutation.mutate()}
            disabled={!category || mutation.isPending}
          >
            {mutation.isPending ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
