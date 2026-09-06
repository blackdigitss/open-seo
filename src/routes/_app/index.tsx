import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProjects } from "@/serverFunctions/projects";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { AuthConfigErrorCard } from "@/client/components/AuthConfigErrorCard";
import { UnauthenticatedErrorCard } from "@/client/components/UnauthenticatedErrorCard";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

// FORK: `/` shows every project's outstanding moves instead of bouncing to
// whichever one was open last. Lazy so custom code stays out of the eager
// bundle (see FORK.md).
const PortfolioHome = lazy(() => import("@/custom/client/home/PortfolioHome"));

export const Route = createFileRoute("/_app/")({
  component: IndexHome,
});

function IndexHome() {
  const navigate = useNavigate();

  const { data, error, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    retry: false,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    // FORK: the remembered project is no longer a redirect target — it is only
    // validated here so a stale id doesn't linger in localStorage.
    const lastProjectId = getLastProjectId();
    const target = data.find((project) => project.id === lastProjectId);
    if (lastProjectId && !target) {
      clearLastProjectId();
    }
  }, [data]);

  useEffect(() => {
    if (getErrorCode(error) !== "PAYMENT_REQUIRED") {
      return;
    }

    void navigate({ href: SUBSCRIBE_ROUTE });
  }, [error, navigate]);

  if (isError) {
    const errorCode = getErrorCode(error);

    if (errorCode === "AUTH_CONFIG_MISSING") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <AuthConfigErrorCard
            message={getStandardErrorMessage(
              error,
              "An unexpected error occurred. Please check server logs.",
            )}
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      );
    }

    if (errorCode === "UNAUTHENTICATED") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <UnauthenticatedErrorCard
            message="Please sign in to access your OpenSEO organization."
            onRetry={() => {
              void refetch();
            }}
          />
        </div>
      );
    }

    if (errorCode === "PAYMENT_REQUIRED") {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <div className="flex flex-col items-center gap-3 max-w-xl text-center">
            <p className="text-base-content/80">
              Redirecting you to billing so you can start a hosted subscription.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="flex flex-col items-center gap-3 max-w-xl">
          <p className="text-error text-center">
            {getStandardErrorMessage(
              error,
              "An unexpected error occurred. Please check server logs.",
            )}
          </p>
        </div>
      </div>
    );
  }

  // FORK: projects exist -> the portfolio home; none yet -> the spinner while
  // the onboarding redirect elsewhere takes over.
  if (data && data.length > 0) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <span className="loading loading-spinner loading-md" />
          </div>
        }
      >
        <PortfolioHome />
      </Suspense>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="loading loading-spinner loading-md" />
    </div>
  );
}
