import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { Panel } from "@/components/base/Panel";
import { Text } from "@/components/base/Text";
import { Input } from "@/components/base/Input";
import { PasswordInput } from "@/components/base/PasswordInput";
import { Button } from "@/components/base/Button";
import { ChipButton } from "@/components/base/ChipButton";
import { AuthHero } from "@/components/domain/auth/AuthHero";
import { useAuthStore } from "@/stores/auth.store";
import { postAuthLogin, postAuthRegister } from "@/services/post/auth.post";
import { lobbyPath } from "@/lib/nav";
import { ApiError } from "@poker-champ/sdk";

type AuthMode = "login" | "register";

export default function LoginScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const setToken = useAuthStore((s) => s.setToken);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("test@example.com");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await postAuthLogin({ email, password });
      if (!res?.token) {
        setError("Invalid response from server");
        return;
      }
      setToken(res.token);
      const nextPath = typeof next === "string" && next.startsWith("/") ? next : lobbyPath();
      router.replace(nextPath);
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async () => {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await postAuthRegister({
        email,
        password,
        username: username.trim() || undefined,
        displayName: username.trim() || "Player",
      });
      if (!res?.token) {
        setError("Invalid response from server");
        return;
      }
      setToken(res.token);
      const nextPath = typeof next === "string" && next.startsWith("/") ? next : lobbyPath();
      router.replace(nextPath);
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message ?? "Create account failed");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = mode === "login" ? onLogin : onRegister;
  const isLogin = mode === "login";
  const ctaLabel = busy
    ? isLogin ? "Signing in..." : "Creating account..."
    : isLogin ? "Sign in" : "Create Account";

  return (
    <Screen>
      <View className="flex-1 justify-center items-center bg-bg px-4 py-6">
        <View className="ui-col items-center w-full max-w-sm gap-8">
          <AuthHero />

          <View
            className={`ui-row ui-inline-0 w-full rounded-full p-1.5 ${
              isLogin ? "ui-surface border border-border-subtle" : "ui-surface border-2 border-gold-soft"
            }`}
          >
            <View className="flex-1">
              <ChipButton
                title="Login"
                onPress={() => setMode("login")}
                selected={isLogin}
                selectedAccent="brand"
              />
            </View>
            <View className="flex-1">
              <ChipButton
                title="Create Account"
                onPress={() => setMode("register")}
                selected={!isLogin}
                selectedAccent="gold"
              />
            </View>
          </View>

          <Panel
            className={`ui-col ui-stack-5 w-full self-stretch ${
              !isLogin ? "border-t-2 border-gold" : ""
            }`}
          >
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
            {!isLogin && (
              <Input
                label="Username (public handle)"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            )}
            <PasswordInput
              label="Password"
              value={password}
              onChangeText={setPassword}
            />
            {!isLogin && (
              <PasswordInput
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            )}
            {error ? <Text variant="danger" className="mt-1">{error}</Text> : null}
            <Button
              className="w-full"
              title={ctaLabel}
              onPress={onSubmit}
              disabled={busy}
            />
          </Panel>
        </View>
      </View>
    </Screen>
  );
}
