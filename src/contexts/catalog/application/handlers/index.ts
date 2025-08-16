// Command Handlers
export { CreateProductHandler } from './create-product.handler';
export { UpdateProductHandler } from './update-product.handler';
export { DeleteProductHandler } from './delete-product.handler';
export { ActivateProductHandler } from './activate-product.handler';
export { DeactivateProductHandler } from './deactivate-product.handler';
export { CategorizeProductHandler } from './categorize-product.handler';
export { ChangeProductPricePropsHandler } from './change-product-price.handler';

// Query Handlers
export { GetProductHandler } from './get-product.handler';
export {
  ListProductsHandler,
  ProductListResult,
} from './list-products.handler';
