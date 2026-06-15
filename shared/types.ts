export interface Product {
  sellerId: string;
  productId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl?: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  sellerId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  buyerId: string;
  orderId: string;
  items: OrderItem[];
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'shipped';
  sellerId: string;
  createdAt: string;
}

export interface CartItem {
  buyerId: string;
  productId: string;
  sellerId: string;
  name: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  addedAt: string;
}

export interface CognitoClaims {
  sub: string;
  email: string;
  'cognito:groups'?: string[];
}
