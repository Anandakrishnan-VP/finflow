import { Link } from 'react-router-dom';
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-2">
      <h1 className="text-2xl font-semibold text-slate-900">404</h1>
      <Link to="/" className="text-sm text-slate-500 hover:underline">Back to cases</Link>
    </div>
  );
}
