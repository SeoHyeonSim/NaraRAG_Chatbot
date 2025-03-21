"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

// Context 타입 정의
interface DarkModeContextType {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

// 기본값 설정
const DarkModeContext = createContext<DarkModeContextType | undefined>(
    undefined
);

// Provider 컴포넌트 정의
export const DarkModeProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    // 다크모드 상태 변경 함수
    const toggleDarkMode = () => {
        setIsDarkMode((prev) => {
            const newTheme = !prev;

            if (newTheme) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }

            return newTheme;
        });
    };

    // 초기 다크모드 설정
    useEffect(() => {
        const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;
        setIsDarkMode(prefersDark);

        if (prefersDark) {
            document.documentElement.classList.add("dark");
        }
    }, []);

    return (
        <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
            {children}
        </DarkModeContext.Provider>
    );
};

// Context를 사용하기 위한 커스텀 훅
export const useDarkMode = () => {
    const context = useContext(DarkModeContext);
    if (!context) {
        throw new Error("useDarkMode must be used within a DarkModeProvider");
    }
    return context;
};
