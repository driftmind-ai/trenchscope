import TrenchScope from './components/TrenchScope';

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,118,110,0.12),transparent_24%)]" />
      <main className="relative mx-auto max-w-7xl px-6 py-8">
        <TrenchScope />
      </main>
    </div>
  );
}

export default App;
