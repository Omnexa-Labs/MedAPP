'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { AccountScope, AuthProvider, useAuth } from './auth';
import { Header } from './header';
import { AppLink, NavigationProvider } from './navigation';
import { Button, Loading, Notice } from './ui';
import { SignIn } from '@/features/sign-in';
import { Handoff, ReturnToApp } from '@/features/handoff';
import { Selection } from '@/features/selection';
import { ApplicationList } from '@/features/application-list';
import { Details } from '@/features/details';
import { Credentials } from '@/features/documents';
import { Review } from '@/features/review';
import { ApplicationHistory } from '@/features/history';
import { useApplication } from '@/features/application-hooks';
import type { Mode, PartnerType } from '@/lib/types';
function SavedApplication({ id, view }: { id: string; view: string }) {
  const query = useApplication(id);
  if (query.isPending)
    return (
      <main className="workspace">
        <Loading />
      </main>
    );
  if (query.isError)
    return (
      <main className="workspace">
        <Notice
          danger
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          {query.error.message}
        </Notice>
        <AppLink href="/">Your applications</AppLink>
      </main>
    );
  const application = query.data;
  if (view === 'history')
    return <ApplicationHistory application={application} />;
  if (application.status !== 'draft' || view === 'review')
    return <Review application={application} />;
  if (view === 'credentials') return <Credentials application={application} />;
  return (
    <Details
      application={application}
      kind={application.partner_type}
      mode={application.onboarding_mode || undefined}
    />
  );
}
function AccountContent() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (pathname === '/') return <ApplicationList />;
  if (pathname === '/new/details') {
    const kind = params.get('kind');
    const mode = params.get('mode');
    if (
      !['practitioner', 'pharmacy', 'hospital'].includes(kind || '') ||
      (kind === 'hospital' && !['facility', 'team'].includes(mode || ''))
    )
      return <Selection />;
    return (
      <Details
        key={`new-${kind}-${mode}`}
        kind={kind as PartnerType}
        mode={(mode as Mode) || undefined}
      />
    );
  }
  const match =
    /^\/applications\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(details|credentials|review|history)$/i.exec(
      pathname,
    );
  if (match)
    return (
      <SavedApplication
        key={match[1] + ':' + match[2]}
        id={match[1]}
        view={match[2]}
      />
    );
  return (
    <main className="workspace">
      <h1>Page not found</h1>
      <AppLink href="/">Go to your applications</AppLink>
    </main>
  );
}
function Content() {
  const auth = useAuth();
  const pathname = usePathname();
  return (
    <>
      <Header />
      {auth.error && (
        <div className="workspace auth-notice">
          <Notice
            danger
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void auth.reload();
                }}
              >
                Retry
              </Button>
            }
          >
            {auth.error}
          </Notice>
        </div>
      )}
      {pathname === '/handoff' ? (
        <Handoff />
      ) : pathname === '/return-to-app' ? (
        <ReturnToApp />
      ) : pathname === '/new' ? (
        <Selection />
      ) : auth.pending ? (
        <main className="workspace">
          <Loading label="Checking your session…" />
        </main>
      ) : !auth.identity ? (
        <SignIn />
      ) : (
        <AccountScope
          key={auth.identity.scope + ':' + auth.identity.user.role}
          identity={auth.identity}
        >
          <AccountContent />
        </AccountScope>
      )}
    </>
  );
}
export function PartnerApp() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <Content />
      </NavigationProvider>
    </AuthProvider>
  );
}
