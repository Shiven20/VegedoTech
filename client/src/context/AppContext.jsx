import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";

axios.defaults.withCredentials = true;
axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL;

export const AppContext = createContext();

export const AppContextProvider = ({children})=>{

    const currency = import.meta.env.VITE_CURRENCY

    const navigate = useNavigate()
    const [user,setUser] = useState(null)
    const [isSeller,setIsSeller]= useState(false)
    const [showUserLogin,setShowUserLogin] = useState(false)
    const [products,setProducts] =useState([])

    const [cartItems,setCartItems] = useState({})
    const [searchQuery, setSearchQuery] = useState("")

    // ---- AI layer ----
    const [aiSearchResults, setAiSearchResults] = useState([])
    const [aiSearchLoading, setAiSearchLoading] = useState(false)
    const [recommendations, setRecommendations] = useState([])
    const [recommendationSource, setRecommendationSource] = useState(null)

    /** Ranked catalogue search powered by /api/ai/search (TF-IDF + typo tolerance). */
    const runSmartSearch = async (query) => {
      const trimmed = (query ?? "").trim();
      if (!trimmed) {
        setAiSearchResults([]);
        return [];
      }
      setAiSearchLoading(true);
      try {
        const { data } = await axios.get("/api/ai/search", {
          params: { q: trimmed, limit: 20 },
        });
        const results = data?.success ? data.results : [];
        setAiSearchResults(results);
        return results;
      } catch (error) {
        console.error("AI search failed:", error.message);
        setAiSearchResults([]);
        return [];
      } finally {
        setAiSearchLoading(false);
      }
    };

    /** Personalised feed. Seeds default to the current cart on the server. */
    const fetchRecommendations = async (productIds = [], limit = 8) => {
      try {
        const { data } = await axios.post("/api/ai/recommendations", {
          productIds,
          limit,
        });
        if (data?.success) {
          setRecommendations(data.recommendations);
          setRecommendationSource(data.source);
          return data.recommendations;
        }
      } catch (error) {
        console.error("AI recommendations failed:", error.message);
      }
      return [];
    };

    /** "More like this" for a single product page. */
    const fetchSimilarProducts = async (productId, limit = 5) => {
      if (!productId) return [];
      try {
        const { data } = await axios.get(`/api/ai/similar/${productId}`, {
          params: { limit },
        });
        return data?.success ? data.recommendations : [];
      } catch (error) {
        console.error("AI similar products failed:", error.message);
        return [];
      }
    };

    const fetchSeller = async () => {
      try {
        const { data } = await axios.get("api/seller/is-auth");
        if (data.success) {
          setIsSeller(true);
          
          
        } else {
            //console.log("here");
          setIsSeller(null);
        }
      } catch {
        setIsSeller(null);
      }
    };

    const fetchUser = async () => {
      try {
        const { data } = await axios.get("/api/user/is-auth");
        if (data.success) {
          setUser(data.user);
          setCartItems(data.user.cartItems);
        } else {
          setUser(false);
        }
      } catch {
        setUser(false);
      }
    };

    const fetchproducts = async () => {
      try {
        const { data } = await axios.get("/api/product/all");

        if (data.success) {
            setProducts(data.products);
          console.log("Products fetched:", data.products); // Or setProducts(data.products)
          return data.products;
        } else {
          console.error("Failed to fetch products:", data.message);
        }
      } catch (error) {
        console.error("Error fetching products:", error.message);
      }
    };

    const addToCart=(itemId)=>{
        let cartData = structuredClone(cartItems)

        if(cartData[itemId]){
            cartData[itemId] +=1;
        } else {
            cartData[itemId]=1
        }
        setCartItems(cartData)
        toast.success("Added to Cart")
    }

    



    const updateCartItem =(itemId,quantity)=>{
        let cartData = structuredClone(cartItems)
        cartData[itemId]=quantity
        setCartItems(cartData)
        toast.success("Cart updated")
    }



    const removeFromCart =(itemId)=>{
        let cartData = structuredClone(cartItems)
        if(cartData[itemId]){
            cartData[itemId]-=1
            if(cartData[itemId]===0){
                delete cartData[itemId]
            }
        }
        toast.success("Removed from cart")
        setCartItems(cartData)
    }

    // Get Cart item count
    const getCartCount=()=>{
        let totalCount =0
        for(const item in cartItems){
            totalCount+=cartItems[item]
        }
        return totalCount
    }

    //Get Cart Total Amount

    const getCartAmount=()=>{
        let totalAmount=0
        for(const items in cartItems){
            let itemInfo= products.find((product)=>product._id === items)
            if(cartItems[items]>0){
                totalAmount+= itemInfo.offerPrice * cartItems[items]
            }
        }
        return Math.floor(totalAmount * 100)/100
    }

    useEffect(()=>{
        fetchUser()
        fetchSeller()
        fetchproducts()
    },[])

    // Debounced AI search so typing doesn't fire a request per keystroke.
    useEffect(() => {
      const trimmed = (searchQuery ?? "").trim();
      if (!trimmed) {
        setAiSearchResults([]);
        return;
      }
      const timer = setTimeout(() => runSmartSearch(trimmed), 350);
      return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        
        
      const updateCart = async () => {
        try {
            
          const { data } = await axios.post("/api/cart/update", { cartItems });
            //console.log(data);
          if (!data.success) {
            toast.error(data.message);
          }
        } catch (error) {
          toast.error(error.message);
        }
      };

      if(user) {
        updateCart();
      }
    }, [cartItems]);

    const value = {
      navigate,
      user,
      setUser,
      setIsSeller,
      isSeller,
      showUserLogin,
      setShowUserLogin,
      products,
      currency,
      addToCart,
      updateCartItem,
      removeFromCart,
      cartItems,
      searchQuery,
      setSearchQuery,
      getCartAmount,
      getCartCount,
      axios,
      fetchproducts,
      setCartItems,
      // AI layer
      runSmartSearch,
      aiSearchResults,
      aiSearchLoading,
      fetchRecommendations,
      fetchSimilarProducts,
      recommendations,
      recommendationSource,
    };

    return <AppContext.Provider value={value}>
        {children}
    </AppContext.Provider>
}

export const useAppContext =()=>{
    return useContext(AppContext)
}