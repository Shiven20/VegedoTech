import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { assets } from '../assets/assets';
import toast from 'react-hot-toast';
import axios from 'axios';



const Navbar = () => {
    const [isScrolled, setIsScrolled] = React.useState(false);
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const { user, setUser, setShowUserLogin, navigate, setSearchQuery, searchQuery, getCartCount } = useAppContext();

    React.useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const logout = async () => {
        try {
            // Request stays inside the try so a network failure is handled too.
            const { data } = await axios.get('/api/user/logout');

            if (data.success) {
                toast.success(data.message);
                setUser(null);
                navigate("/");
            } else {
                toast.error(data.message || "Logout failed");
            }
        } catch (error) {
            toast.error(error.response?.data?.message || error.message);
        }
    };

    useEffect(()=>{
        if(searchQuery.length>0){
            navigate("/products")
        }
    },[searchQuery])

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'All products', path: '/products' },
        { name: 'Contact', path: '/contact' },
        { name: 'About', path: '/about' },
    ];

    return (
        <nav className={`fixed top-0 left-0 w-full flex items-center justify-between px-4 md:px-16 lg:px-24 xl:px-32 transition-all duration-500 z-50 
  ${isScrolled 
    ? "bg-white/80 shadow-xl backdrop-blur-lg border-b border-gray-200 py-3 md:py-4 text-gray-800" 
    : "bg-primary py-4 md:py-6 text-white"}`}>


            {/* Logo */}
            <NavLink to='/' onClick={() => setIsMenuOpen(false)}>
                <img src={assets.vegedologo} alt="" className={`h-15 text-black w-50 ${isScrolled && "invert opacity-80"}`} />
            </NavLink>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-4 lg:gap-8">
                {navLinks.map((link, i) => (
                    <NavLink key={i} to={link.path} className={`group flex flex-col gap-0.5 ${isScrolled ? "text-gray-700" : "text-white"} hover:text-slate-900 hover:drop-shadow-md transition-all duration-300
`}>
                        {link.name}
                        <div className={`${isScrolled ? "bg-gray-700" : "bg-white"} h-0.5 w-0 group-hover:w-full transition-all duration-300`} />
                    </NavLink>
                ))}
{user && (
  <NavLink
    to="/my-orders"
    onClick={() => setIsMenuOpen(false)}
    className={`group flex flex-col items-start gap-0.5 transition-colors duration-300 ${
      isScrolled ? "text-gray-800" : "text-white"
    } hover:text-black`}
  >
    <span className="transition-colors duration-300">My Orders</span>
    <span className="block h-0.5 w-0 group-hover:w-full bg-white transition-all duration-300"></span>
  </NavLink>
)}


            </div>

            {/* Search Bar */}
            <div className="hidden lg:flex items-center text-sm gap-2 border border-gray-300 px-3 rounded-full">
                <input onChange={(e)=> setSearchQuery(e.target.value)} className={`py-1.5 w-full bg-transparent outline-none placeholder-gray-500 ${
                isScrolled ? "text-black" : "text-white"
                }`}  type="text" placeholder="Search products" />
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10.836 10.615 15 14.695" stroke={isScrolled ? "#333" : "white"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    <path clipRule="evenodd" d="M9.141 11.738c2.729-1.136 4.001-4.224 2.841-6.898S7.67.921 4.942 2.057C2.211 3.193.94 6.281 2.1 8.955s4.312 3.92 7.041 2.783" stroke={isScrolled ? "#333" : "white"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

            </div>

            {/* Cart Icon */}
            <div onClick={() => navigate("/cart")} className={`hidden lg:flex    relative cursor-pointer md:block ${isMenuOpen ? 'hidden' : ''} animate-fadeIn`}>
                <img src={assets.nav_cart_icon} alt="cart" className='w-6 opacity-80' />
                <button className="absolute -top-2 -right-3 text-xs text-white bg-black w-[18px] h-[18px] rounded-full">{getCartCount()}</button>
            </div>

            {/* Login/Profile */}
            <div className="hidden md:flex items-center gap-4">
                {!user ? (
                    <button onClick={() => { setShowUserLogin(true) }} className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer duration-300"



>
                        Login
                    </button>
                ) : (
                    <div className='relative group'>
                        <img src={assets.profile_icon} className='w-10' alt="" />
                        <ul className='absolute top-10 right-0 bg-white shadow border border-gray-200 py-2.5 w-30 rounded-md text-sm z-40 transition-all duration-300 origin-top scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100'>
                            <li onClick={() => navigate("my-orders")} className='p-1.5 pl-3 hover:bg-primary/10 cursor-pointer text-black'>My Orders</li>
                            <li onClick={logout} className='p-1.5 pl-3 hover:bg-primary/10 cursor-pointer text-black'>Logout</li>
                        </ul>
                    </div>
                )}
            </div>
            {/* Cart Icon - Mobile only */}
            <div onClick={() => navigate("/cart")} className="flex lg:hidden relative cursor-pointer ml-auto mr-15">
                <img src={assets.nav_cart_icon} alt="cart" className='w-6 opacity-80' />
                <button className="absolute -top-2 -right-3 text-xs text-white bg-black w-[18px] h-[18px] rounded-full">
                    {getCartCount()}
                </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-3 md:hidden">
                <svg onClick={() => setIsMenuOpen(!isMenuOpen)} className={`h-6 w-6 cursor-pointer ${isScrolled ? "invert" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <line x1="4" y1="6" x2="20" y2="6" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
            </div>

            {/* Mobile Menu */}
            
            <div className={`fixed top-0 left-0 w-full h-screen bg-white text-base flex flex-col md:hidden items-center justify-center gap-6 font-medium text-gray-800 transform transition-transform duration-500 ease-in-out ${isMenuOpen ? "translate-x-0 opacity-100 scale-100" : "-translate-x-full opacity-0 scale-90 z-50"}`}>
                <button className="absolute top-4 right-4" onClick={() => setIsMenuOpen(false)}>
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                {navLinks.map((link, i) => (
                    <NavLink key={i} to={link.path} onClick={() => setIsMenuOpen(false)}>
                        {link.name}
                    </NavLink>
                ))}
                {user &&
                    <NavLink to='/products'  onClick={() => setIsMenuOpen(false)}>My Orders</NavLink>
                }
                {!user ? (
                    <button
                        onClick={() => {
                            setIsMenuOpen(false)
                            setShowUserLogin(true)
                        }}
                        className="bg-black cursor-pointer text-white px-8 py-2.5 rounded-full transition-all duration-500">
                        Login
                    </button>
                ) : (
                    <button onClick={logout} className="bg-black text-white px-8 py-2.5 rounded-full transition-all duration-500">
                        Logout
                    </button>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
