import { useState } from "react";
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
import { ArrowLeft, Loader2, User, Lock } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [profile, setProfile] = useState({
    displayName: user?.displayName || "",
    bio: (user as any)?.bio || "",
    location: (user as any)?.location || "",
    avatarUrl: (user as any)?.avatarUrl || "",
  });

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const profileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/users/me", {
        displayName: profile.displayName || undefined,
        bio: profile.bio || undefined,
        location: profile.location || undefined,
        avatarUrl: profile.avatarUrl || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
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

  if (!user) return <Redirect to="/login" />;

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
          <div className="space-y-1.5">
            <Label htmlFor="avatarUrl">Avatar URL</Label>
            <Input
              id="avatarUrl"
              type="url"
              value={profile.avatarUrl}
              onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
              placeholder="https://..."
              data-testid="settings-avatar-url"
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
      <Card>
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
    </div>
  );
}
