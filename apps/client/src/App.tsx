import { AppRoutes } from "./app/routes";
import { ErrorToast } from "./components/ErrorToast";
import { DevTools } from "./components/DevTools";

export default function App() {
  return (
    <>
      <AppRoutes />
      <ErrorToast />
      {import.meta.env.DEV && <DevTools />}
    </>
  );
}
