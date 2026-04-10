import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const isFormFilled = email.length > 0 && password.length > 0;

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Here you would normally authenticate. For now, navigate to the portal.
        if (isFormFilled) {
            navigate('/app');
        }
    };

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 font-sans">
            <div className="w-full max-w-[360px] flex flex-col items-center">
                
                {/* Logo */}
                <div className="mb-12 flex items-center justify-center scale-150 transform">
                    <BrandLogo />
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="w-full space-y-4">
                    <div>
                        <input 
                            type="email" 
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-500 text-slate-700 placeholder:text-slate-400"
                            required
                        />
                    </div>
                    
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Contraseña"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-500 text-slate-700 placeholder:text-slate-400 pr-12"
                            required
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 p-1"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    <div className="flex justify-start w-full pt-1">
                        <a href="#" className="font-bold text-sm hover:underline" style={{ color: 'var(--color-action)' }}>
                            Olvidé mi contraseña
                        </a>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit"
                            disabled={!isFormFilled}
                            className={`w-full py-3.5 rounded font-bold text-base transition-colors ${
                                isFormFilled 
                                ? "text-white" 
                                : "bg-[#e0e0e0] text-[#a0a0a0] cursor-not-allowed"
                            }`}
                            style={isFormFilled ? { background: 'var(--color-accent)' } : {}}
                            onMouseEnter={(e) => { if(isFormFilled) e.currentTarget.style.background = 'var(--color-action)' }}
                            onMouseLeave={(e) => { if(isFormFilled) e.currentTarget.style.background = 'var(--color-accent)' }}
                        >
                            Ingresar
                        </button>
                    </div>
                </form>

                {/* Footer Links */}
                <div className="mt-6 text-center space-y-3">
                    <p className="text-[#666666] text-sm">
                        ¿Aún no tienes cuenta? <a href="#" className="font-bold hover:underline" style={{ color: 'var(--color-action)' }}>Regístrate aquí</a>
                    </p>
                    
                    <div className="flex flex-col gap-2 pt-2">
                        <a href="#" className="font-bold text-sm hover:underline" style={{ color: 'var(--color-action)' }}>
                            Política de privacidad
                        </a>
                        <a href="#" className="font-bold text-sm hover:underline" style={{ color: 'var(--color-action)' }}>
                            Términos y condiciones
                        </a>
                    </div>
                </div>

                {/* Social Login Area */}
                <div className="mt-10 flex items-center justify-center gap-6">
                    <button className="w-12 h-12 bg-white rounded-full flex items-center justify-center hover:shadow-md transition-shadow">
                        {/* Placeholder for FieldView or equivalent Ag partner logo */}
                        <span className="font-black text-[10px] leading-tight text-amber-500 text-center">AGRO<br/>PARTNER</span>
                    </button>
                    <button className="w-12 h-12 bg-[#f4f4f4] rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors">
                        {/* Google G logo simplified SVG */}
                        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                    </button>
                </div>

            </div>
        </div>
    );
}
