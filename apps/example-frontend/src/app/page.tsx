import { Button } from '@/molecules/buttons/Button';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-text-primary">
          Scaffold App
        </h1>
        <p className="mt-4 text-lg text-text-secondary">
          A product-agnostic scaffold demonstrating best practices for monorepo applications.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <Button variant="primary">Get Started</Button>
          <Button variant="secondary">Learn More</Button>
        </div>
      </div>
    </main>
  );
}
