import React from 'react'
import MainBanner from '../components/MainBanner'
import Categories from '../components/Categories'
import BestSeller from '../components/BestSeller'
import BottomBanner from '../components/BottomBanner'
import NewsLetter from '../components/NewsLetter'
import RecommendedProducts from '../components/RecommendedProducts'

const Home = () => {
  return (
    <div className='mt-10'>
        <MainBanner/>
        <Categories/>
        <BestSeller/>
        {/* AI: personalised from cart / order history, trending for new visitors */}
        <RecommendedProducts
          title="Recommended for you"
          subtitle="Learned from your cart and what shoppers buy together"
          limit={5}
        />
        <BottomBanner/>
        <NewsLetter/>
    </div>
  )
}

export default Home