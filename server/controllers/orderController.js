  // import Order from "../models/Order.js";
  // import Product from "../models/Product.js";
  // import User from "../models/User.js"
  // import stripe from "stripe"

  // export const placeOrderCOD = async (req, res) => {
  //   try {
  //     const { userId, items, address } = req.body;

  //     if (!address || items.length === 0) {
  //       return res.json({ success: false, message: "Invalid data" });
  //     }

  //     // Calculate amount from items
  //     let amount = await items.reduce(async (acc, item) => {
  //       const product = await Product.findById(item.product);
  //       return (await acc) + product.offerPrice * item.quantity;
  //     }, Promise.resolve(0));

  //     // Add tax (2%)
  //     amount += Math.floor(amount * 0.02);

  //     // Create Order
  //     const newOrder = new Order({
  //       userId,
  //       items,
  //       amount,
  //       address,
  //       paymentType: "COD",
  //       isPaid: false,
  //     });

  //     await newOrder.save();

  //     res.status(201).json({
  //       success: true,
  //       message: "Order placed successfully with COD",
  //       order: newOrder,
  //     });
  //   } catch (error) {
  //     console.error(error.message);
  //     res.status(500).json({ success: false, message: "Server error" });
  //   }
  // };


  // export const placeOrderStripe = async (req, res) => {
    
    
  //   try {
  //     const { userId, items, address } = req.body;
  //     const {origin} = req.headers;

  //     if (!address || items.length === 0) {
  //       return res.json({ success: false, message: "Invalid data" });
  //     }
  //     let productData = [];
  //     // Calculate amount from items
  //     let amount = await items.reduce(async (acc, item) => {
  //       const product = await Product.findById(item.product);
  //       productData.push({
  //         name: product.name,
  //         price: product.offerPrice,
  //         quantity: item.quantity
  //       })
  //       return (await acc) + product.offerPrice * item.quantity;
  //     }, (0));

  //     // Add tax (2%)
  //     amount += Math.floor(amount * 0.02);

  //     // Create Order
  //     const newOrder = await Order.create({
  //       userId,
  //       items,
  //       amount,
  //       address,
  //       paymentType: "Online",
        
  //     });

  //     const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
      
  //     const line_items = productData.map((item)=>{

  //     return {  price_data: {
  //         currency: "usd",
  //         product_data: {
  //           name: item.name,
  //         },
  //         unit_amount : Math.floor(item.price * (1.02) * 100)
  //       },
  //       quantity: item.quantity,
  //     }

  //     })

  //     const session = await stripeInstance.checkout.sessions.create({
  //       line_items,
  //       mode: "payment",
  //       success_url: `${origin}/loader?next=my-orders`,
  //       cancel_url: `${origin}/cart`,
  //       payment_intent_data: {
  //         metadata: {
  //           orderId: newOrder._id.toString(),
  //           userId,
  //         },
  //       },
  //     });

      

  //     res.status(201).json({
  //       success: true,
  //       message: "Order placed successfully",
  //       url: session.url
  //     });
  //   } catch (error) {
  //     console.error(error.message);
  //     res.status(500).json({ success: false, message: "Server error" });
  //   }
  // };


  // export const stripeWebhooks = async (request, response) => {

  //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  //   const sig = request.headers["stripe-signature"];
  //   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  //   let event;

  //   try {
  //     event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  //     console.log("✅ Event verified:", event.type);
  //   } catch (err) {
  //     console.error("❌ Webhook signature verification failed:", err.message);
  //     return response.status(400).send(`Webhook Error: ${err.message}`);
  //   }

  //   try {
  //     switch (event.type) {
  //       case "payment_intent.succeeded": {
  //         const paymentIntent = event.data.object;
  //         const paymentIntentId = paymentIntent.id;
  //         console.log("✅ Payment intent succeeded for", paymentIntentId);

  //         const sessionList = await stripe.checkout.sessions.list({
  //           payment_intent: paymentIntentId,
  //         });

  //         if (!sessionList.data.length) {
  //           console.error("❌ No session found for payment intent");
  //           return response.status(404).send("No session found");
  //         }

  //         const { orderId, userId } = sessionList.data[0].metadata;

  //         await Order.findByIdAndUpdate(orderId, { isPaid: true });
  //         await User.findByIdAndUpdate(userId, { cartItems: [] });

  //         console.log(`✅ Payment confirmed for Order ${orderId}`);
  //         break;
  //       }

  //       case "payment_intent.payment_failed": {
  //         const paymentIntent = event.data.object;
  //         const paymentIntentId = paymentIntent.id;
  //         console.log("❌ Payment failed for", paymentIntentId);

  //         const sessionList = await stripe.checkout.sessions.list({
  //           payment_intent: paymentIntentId,
  //         });

  //         if (!sessionList.data.length) {
  //           console.error("❌ No session found for failed payment");
  //           return response.status(404).send("No session found");
  //         }

  //         const { orderId } = sessionList.data[0].metadata;
  //         await Order.findByIdAndDelete(orderId);
  //         console.log(`🗑️ Deleted unpaid Order ${orderId}`);
  //         break;
  //       }

  //       default:
  //         console.log(`⚠️ Unhandled event type: ${event.type}`);
  //     }

  //     return response.json({ received: true });
  //   } catch (err) {
  //     console.error("❌ Error in webhook processing:", err.message);
  //     return response.status(500).send("Internal Server Error");
  //   }
  // };
  // // export const stripeWebhooks = async (request, response) => {
    
  // //   const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);

  // //   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // //   const sig = request.headers["stripe-signature"];

  // //   let event;

  // //   try {
  // //     event = stripeInstance.webhooks.constructEvent(
  // //       request.body,
  // //       sig,
  // //       endpointSecret
  // //     );
  // //   } catch (err) {
  // //     console.error("Webhook signature verification failed:", err.message);
  // //     return response.status(400).send(`Webhook Error: ${err.message}`);
  // //   }

  // //   // Handle the event
  // //   switch (event.type) {
  // //     case "payment_intent.succeeded": {
  // //       const paymentIntent = event.data.object;
  // //       const paymentIntentId = paymentIntent.id;
  // //       console.log("passed");
        
  // //       // Getting Session Metadata
  // //       const session = await stripe.checkout.sessions.list({
  // //         payment_intent: paymentIntentId,
  // //       });

  // //       const { orderId, userId } = session.data[0].metadata;

  // //       // ✅ Mark payment as paid in the database
  // //       await Order.findByIdAndUpdate(orderId, {
  // //         isPaid: true,
  // //       });
  // //       await User.findByIdAndUpdate(userId, { cartItems: [] });

  // //       console.log(`✅ Payment confirmed for Order ${orderId}`);
  // //       break;
  // //     }

  // //     case "payment_intent.payment_failed": {
  // //       const paymentIntent = event.data.object;
  // //       const paymentIntentId = paymentIntent.id;
  // //       console.log("failed");
  // //       // Getting Session Metadata
  // //       const session = await stripeInstance.checkout.sessions.list({
  // //         payment_intent: paymentIntentId,
  // //       });

  // //       const { orderId } = session.data[0].metadata;
  // //       await Order.findByIdAndDelete(orderId);
  // //       break;
  // //     }

  // //     default:

  // //       console.log(`Unhandled event type: ${event.type}`);
  // //   }

  // //   response.json({recieved : true});
  // // };

  // // Get Orders by User ID : /api/order/user


  // export const getUserOrders = async (req, res) => {
  //   try {
  //     const { userId } = req.body;

  //     const orders = await Order.find({
  //       userId,
  //       $or: [{ paymentType: "COD" }, { isPaid: true }],
  //     })
  //       .populate("items.product")
  //       .populate("address")
  //       .sort({ createdAt: -1 });

  //     res.status(200).json({
  //       success: true,
  //       orders,
  //     });
  //   } catch (error) {
  //     console.error(error.message);
  //     res.status(500).json({
  //       success: false,
  //       message: "Failed to get user orders",
  //     });
  //   }
  // };

  // export const getAllOrders = async (req, res) => {
  //   try {
    

  //     const orders = await Order.find({
  //       $or: [{ paymentType: "COD" }, { isPaid: true }],
  //     })
  //       .populate("items.product")
  //       .populate("address")
  //       .sort({ createdAt: -1 });

  //     res.status(200).json({
  //       success: true,
  //       orders,
  //     });
  //   } catch (error) {
  //     console.error(error.message);
  //     res.status(500).json({
  //       success: false,
  //       message: "Failed to get user orders",
  //     });
  //   }
  // };

  import Order from "../models/Order.js";
  import Product from "../models/Product.js";
  import User from "../models/User.js";
  import Stripe from "stripe";

  // COD Order Placement
  export const placeOrderCOD = async (req, res) => {
    try {
      const { userId, items, address } = req.body;
      if (!address || items.length === 0) {
        return res.json({ success: false, message: "Invalid data" });
      }

      let amount = await items.reduce(async (acc, item) => {
        const product = await Product.findById(item.product);
        return (await acc) + product.offerPrice * item.quantity;
      }, Promise.resolve(0));

      amount += Math.floor(amount * 0.02);

      const newOrder = new Order({
        userId,
        items,
        amount,
        address,
        paymentType: "COD",
        isPaid: false,
      });

      await newOrder.save();

      res.status(201).json({
        success: true,
        message: "Order placed successfully with COD",
        order: newOrder,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };

  // Stripe Order Placement
  export const placeOrderStripe = async (req, res) => {
    try {
      const { userId, items, address } = req.body;
      const { origin } = req.headers;

      if (!address || items.length === 0) {
        return res.json({ success: false, message: "Invalid data" });
      }

      let productData = [];
      let amount = await items.reduce(async (acc, item) => {
        const product = await Product.findById(item.product);
        productData.push({
          name: product.name,
          price: product.offerPrice,
          quantity: item.quantity,
        });
        return (await acc) + product.offerPrice * item.quantity;
      }, Promise.resolve(0));

      amount += Math.floor(amount * 0.02);

      const newOrder = await Order.create({
        userId,
        items,
        amount,
        address,
        paymentType: "Online",
      });

      const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

      const line_items = productData.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: { name: item.name },
          unit_amount: Math.floor(item.price * 1.02 * 100),
        },
        quantity: item.quantity,
      }));

      const session = await stripeInstance.checkout.sessions.create({
        line_items,
        mode: "payment",
        success_url: `${origin}/loader?next=my-orders`,
        cancel_url: `${origin}/cart`,
        payment_intent_data: {
          metadata: {
            orderId: newOrder._id.toString(),
            userId,
          },
        },
      });

      res.status(201).json({
        success: true,
        message: "Order placed successfully",
        url: session.url,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };

  // Stripe Webhook
  export const stripeWebhooks = async (request, response) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = request.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
      console.log("✅ Event verified:", event.type);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err.message);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          const { orderId, userId } = paymentIntent.metadata || {};

          if (!orderId || !userId) {
            console.error("❌ Missing metadata in payment intent");
            return response.status(400).send("Missing metadata");
          }

          await Order.findByIdAndUpdate(orderId, { isPaid: true });
          await User.findByIdAndUpdate(userId, { cartItems: [] });

          console.log(`✅ Payment confirmed for Order ${orderId}`);
          break;
        }
        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;
          const { orderId } = paymentIntent.metadata || {};

          if (!orderId) {
            console.error("❌ Missing orderId in metadata");
            return response.status(400).send("Missing orderId");
          }

          await Order.findByIdAndDelete(orderId);
          console.log(`🗑️ Deleted unpaid Order ${orderId}`);
          break;
        }
        default:
          console.log(`⚠️ Unhandled event type: ${event.type}`);
      }
      return response.json({ received: true });
    } catch (err) {
      console.error("❌ Error in webhook processing:", err.message);
      return response.status(500).send("Internal Server Error");
    }
  };

  // Fetch User Orders
  export const getUserOrders = async (req, res) => {
    try {
      const { userId } = req.body;

      const orders = await Order.find({
        userId,
        $or: [{ paymentType: "COD" }, { isPaid: true }],
      })
        .populate("items.product")
        .populate("address")
        .sort({ createdAt: -1 });

      res.status(200).json({ success: true, orders });
    } catch (error) {
      console.error(error.message);
      res
        .status(500)
        .json({ success: false, message: "Failed to get user orders" });
    }
  };

  // Fetch All Orders
  export const getAllOrders = async (req, res) => {
    try {
      const orders = await Order.find({
        $or: [{ paymentType: "COD" }, { isPaid: true }],
      })
        .populate("items.product")
        .populate("address")
        .sort({ createdAt: -1 });

      res.status(200).json({ success: true, orders });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ success: false, message: "Failed to get orders" });
    }
  };
