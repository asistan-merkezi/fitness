import { Dumbbell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default function GirisSayfasi() {
  return (
    <div className="dark flex min-h-svh flex-1 items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
          <Dumbbell className="size-5 text-primary" aria-hidden />
          Fitness Asistanı
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-lg">Giriş</CardTitle>
            <CardDescription>İşletme hesabınızla giriş yapın.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
