import React, { useEffect, useMemo, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import ProductCard from '../components/ProductCard'
import RecommendedProducts from '../components/RecommendedProducts'

const AllProducts = () => {

    const {products, searchQuery, aiSearchResults, aiSearchLoading} = useAppContext()
    const [filteredProducts, setFilteredproducts] = useState([])
    // True when results came from the ranked AI endpoint rather than a substring match.
    const [usedAiRanking, setUsedAiRanking] = useState(false)

    const hasQuery = (searchQuery ?? "").trim().length > 0

    useEffect(()=>{
        if(!hasQuery){
            setFilteredproducts(products)
            setUsedAiRanking(false)
            return
        }

        if(aiSearchResults.length > 0){
            // Preserve the model's ranking, but read stock/price from the live catalogue.
            const byId = new Map(products.map((p) => [p._id, p]))
            setFilteredproducts(
                aiSearchResults
                    .map((hit) => byId.get(hit._id) ?? hit)
                    .filter(Boolean)
            )
            setUsedAiRanking(true)
            return
        }

        // Fallback while the request is in flight or if the AI service is down.
        setFilteredproducts(
            products.filter((product) =>
                product.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
        )
        setUsedAiRanking(false)
    },[products, searchQuery, aiSearchResults, hasQuery])

    const inStockProducts = useMemo(
        () => filteredProducts.filter((product) => product.inStock),
        [filteredProducts]
    )

  return (
    <div className=' pt-20 mt-16 flex flex-col'>
       <div className='flex flex-col items-end w-max'>
         <p className='text-2xl font-medium uppercase'>All products</p>
         <div className='w-16 h-0.5 bg-primary rounded-full'></div>
        </div>

        {hasQuery && (
          <div className='flex items-center gap-2 mt-4 text-sm text-gray-500' aria-live="polite">
            <span>
              {aiSearchLoading
                ? `Searching for "${searchQuery}"...`
                : `${inStockProducts.length} result${inStockProducts.length === 1 ? "" : "s"} for "${searchQuery}"`}
            </span>
            {usedAiRanking && !aiSearchLoading && (
              <span className='text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-1 rounded-full'>
                AI ranked
              </span>
            )}
          </div>
        )}

        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-6 lg:grid-cols-5 mt-6'>
            {inStockProducts.map((product)=>(
                <ProductCard key={product._id} product={product}/>
            ))}
        </div>

        {hasQuery && !aiSearchLoading && inStockProducts.length === 0 && (
          <p className='text-gray-500 mt-8'>
            No products matched "{searchQuery}". Try a different term.
          </p>
        )}

        {!hasQuery && (
          <RecommendedProducts
            title="You might also like"
            subtitle="Suggestions from our recommendation model"
            limit={5}
          />
        )}
        <div className='pb-16' />
    </div>
  )
}

export default AllProducts
