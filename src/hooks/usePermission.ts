import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";

export function usePermission(permissionCode: string) {
  const { hasPermission, user, role } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      if (!user) {
        setAllowed(false);
        setLoading(false);
        return;
      }

      // Owner, admin, and master always have all permissions
      if (role === 'owner' || role === 'admin' || role === 'master') {
        setAllowed(true);
        setLoading(false);
        return;
      }

      try {
        const result = await hasPermission(permissionCode);
        setAllowed(result);
      } catch (error) {
        console.error("Error checking permission:", error);
        setAllowed(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [permissionCode, user, role, hasPermission]);

  return { allowed, loading };
}

// Hook for checking multiple permissions at once
export function usePermissions(permissionCodes: string[]) {
  const { hasPermission, user, role } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      if (!user) {
        const denied = permissionCodes.reduce((acc, code) => ({ ...acc, [code]: false }), {});
        setPermissions(denied);
        setLoading(false);
        return;
      }

      // Owner, admin, and master always have all permissions
      if (role === 'owner' || role === 'admin' || role === 'master') {
        const allAllowed = permissionCodes.reduce((acc, code) => ({ ...acc, [code]: true }), {});
        setPermissions(allAllowed);
        setLoading(false);
        return;
      }

      try {
        const results: Record<string, boolean> = {};
        for (const code of permissionCodes) {
          results[code] = await hasPermission(code);
        }
        setPermissions(results);
      } catch (error) {
        console.error("Error checking permissions:", error);
        const denied = permissionCodes.reduce((acc, code) => ({ ...acc, [code]: false }), {});
        setPermissions(denied);
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, [permissionCodes.join(','), user, role, hasPermission]);

  return { permissions, loading };
}
