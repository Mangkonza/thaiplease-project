import { useMemo, useState } from 'react';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('thaiplease_user');
    return stored ? JSON.parse(stored) : null;
  });

  const value = useMemo(() => ({
    user,
    signIn(token, nextUser) {
      localStorage.setItem('thaiplease_token', token);
      localStorage.setItem('thaiplease_user', JSON.stringify(nextUser));
      setUser(nextUser);
    },
    signOut() {
      localStorage.removeItem('thaiplease_token');
      localStorage.removeItem('thaiplease_user');
      setUser(null);
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
