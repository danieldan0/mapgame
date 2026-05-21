import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export interface AuthState {
  accountUsername: string | null;
  authError: string | null;
  login: (username: string, password: string) => void;
  register: (username: string, password: string) => void;
  logout: () => void;
  dismissAuthError: () => void;
}

export function useAuth(socket: Socket): AuthState {
  const [accountUsername, setAccountUsername] = useState<string | null>(
    () => localStorage.getItem('mapgame_username'),
  );
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const onAuthenticated = ({ token, name, username }: { token: string; name: string; username?: string }) => {
      localStorage.setItem('mapgame_token', token);
      localStorage.setItem('mapgame_player_name', name);
      if (username) {
        localStorage.setItem('mapgame_username', username);
        setAccountUsername(username);
      }
    };

    const onRegisterSuccess = ({ username }: { username: string }) => {
      localStorage.setItem('mapgame_username', username);
      setAccountUsername(username);
      setAuthError(null);
    };

    const onAuthError = (message: string) => setAuthError(message);

    socket.on('authenticated', onAuthenticated);
    socket.on('registerSuccess', onRegisterSuccess);
    socket.on('authError', onAuthError);

    return () => {
      socket.off('authenticated', onAuthenticated);
      socket.off('registerSuccess', onRegisterSuccess);
      socket.off('authError', onAuthError);
    };
  }, [socket]);

  const login = (username: string, password: string) => {
    setAuthError(null);
    socket.emit('login', { username, password });
  };

  const register = (username: string, password: string) => {
    setAuthError(null);
    socket.emit('register', { username, password });
  };

  const dismissAuthError = () => setAuthError(null);

  const logout = () => {
    localStorage.removeItem('mapgame_token');
    localStorage.removeItem('mapgame_username');
    localStorage.removeItem('mapgame_player_name');
    setAccountUsername(null);
    window.location.reload();
  };

  return { accountUsername, authError, login, register, logout, dismissAuthError };
}
