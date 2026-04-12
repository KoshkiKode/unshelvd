import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Loader2, User, Lock, Trash2, Upload, ImageIcon, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({
    displayName: user?.displayName || "",
    bio: user?.bio || "",
    location: user?.location || "",
    avatarUrl: user?.avatarUrl || "",
  });

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/users/me", {
        displayName: profile.displayName || undefined,
        bio: profile.bio || undefined,
        location: profile.location || undefined,
        avatarUrl: avatarPreview || profile.avatarUrl || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setAvatarPreview(null);
      toast({ title: "Profile updated!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update profile", description: err.message, variant: "destructive" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (passwords.newPassword !== passwords.confirmPassword) {
        throw new Error("New passwords do not match");
      }
      const res = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to change password");
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully!" });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to change password", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/users/me", { password: deletePassword });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || "Failed to delete account");
      }
      return await res.json();
    },
    onSuccess: async () => {
      toast({ title: "Account deleted", description: "Your account has been permanently removed." });
      await logout();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
    },
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 1_048_576) {
      toast({ title: "File too large", description: "Avatar image must be under 1 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  if (!user) return <Redirect to="/login" />;

  const displayAvatar = avatarPreview || profile.avatarUrl;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8" data-testid="settings-page">
      <Link href="/dashboard">
        <Button variant="ghost" size="sm" className="mb-6 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>
      </Link>

      <h1 className="font-serif text-3xl font-bold mb-8">Account Settings</h1>

      {/* Profile section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar upload */}
          <div className="space-y-1.5">
            <Label>Profile Photo</Label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted border flex items-center justify-center overflow-hidden flex-shrink-0">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Avatar" className="h-16 w-16 object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                  data-testid="avatar-file-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Photo
                </Button>
                <p className="text-[11px] text-muted-foreground">JPEG, PNG, WebP or GIF · Max 1 MB</p>
              </div>
            </div>
            {avatarPreview && (
              <p className="text-xs text-muted-foreground">New photo selected — save profile to apply.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={profile.displayName}
              onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
              placeholder="Your name"
              data-testid="settings-display-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="Tell the community a bit about yourself..."
              rows={3}
              data-testid="settings-bio"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={profile.location}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              placeholder="City, Country"
              data-testid="settings-location"
            />
          </div>
          <Button
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending}
            data-testid="save-profile-btn"
          >
            {profileMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      {/* Password section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <Lock className="h-5 w-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              autoComplete="current-password"
              data-testid="current-password"
            />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              autoComplete="new-password"
              data-testid="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
              autoComplete="new-password"
              data-testid="confirm-password"
            />
          </div>
          <Button
            onClick={() => passwordMutation.mutate()}
            disabled={passwordMutation.isPending || !passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword}
            data-testid="change-password-btn"
          >
            {passwordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Danger zone — Account deletion */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-lg text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Permanently delete your account and remove all personal data. Transaction history is
            anonymised but retained for compliance. This action <strong>cannot be undone</strong>.
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            You cannot delete your account while you have active transactions. Please complete or
            cancel all orders first.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="delete-account-btn"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete My Account
          </Button>
        </CardContent>
      </Card>

      {/* Delete account confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently anonymise your account. Your listings, messages, and personal
                details will be removed. Transaction records are retained for accounting.
              </span>
              <span className="block font-medium text-foreground">
                Enter your password to confirm:
              </span>
              <Input
                type="password"
                placeholder="Your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                data-testid="delete-confirm-password"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePassword("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={!deletePassword || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Yes, delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
