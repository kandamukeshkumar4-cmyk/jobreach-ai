import { LandingPage } from '@/components/landing/landing-page';
import { LandingAuthRedirect } from '@/components/auth/landing-auth-redirect';

export default function Page() {
  return (
    <>
      <LandingAuthRedirect />
      <LandingPage />
    </>
  );
}
