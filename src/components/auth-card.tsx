import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";

// The centered card used by the four auth screens.
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <h1 className="font-heading text-xl font-semibold leading-snug">{title}</h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
      {footer ? (
        <CardFooter className="flex-wrap justify-center gap-1 text-sm text-muted-foreground">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
