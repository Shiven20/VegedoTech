import Product from "../models/Product.js";
import cloudinary from "cloudinary";
import { invalidateModel } from "../ml/modelStore.js";

// ADD PRODUCT
export const addProduct = async (req, res) => {
  try {
    const { name, description, price, offerPrice, category, inStock } =
      req.body;

    // Upload images to Cloudinary
    const imageUploadPromises = req.files.map((file) =>
      cloudinary.v2.uploader.upload(file.path, {
        resource_type: "image",
      })
    );
    const uploadedImages = await Promise.all(imageUploadPromises);
    const imageUrls = uploadedImages.map((img) => img.secure_url);

    const newProduct = new Product({
      name,
      description,
      price,
      offerPrice,
      category,
      inStock,
      image: imageUrls,
    });

    await newProduct.save();
    invalidateModel(); // catalogue changed, refit recommendations on next request
    res
      .status(201)
      .json({ success: true, message: "Product added", product: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET ALL PRODUCTS
export const productList = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET PRODUCT BY ID
export const productById = async (req, res) => {
  try {
    const { id } = req.body;
    const product = await Product.findById(id);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CHANGE STOCK
export const changeStock = async (req, res) => {
  try {
    
    const { id , inStock } = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { inStock },
      { new: true }
    );
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    invalidateModel(); // stock flag feeds the recommender's filtering
    res
      .status(200)
      .json({ success: true, message: "Stock status updated", product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
