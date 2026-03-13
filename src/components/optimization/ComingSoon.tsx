interface ComingSoonProps {
  title: string;
  phase: string;
  description: string;
}

export function ComingSoon({ title, phase, description }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
      <div className="px-3 py-1 bg-secondary rounded-full text-xs text-muted-foreground font-medium">
        {phase}
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}
