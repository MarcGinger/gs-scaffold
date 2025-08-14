# Event Versioning Policy

## 📋 **Core Principle: Never Mutate Events**

**Golden Rule**: Once an event is published to production, it is **immutable**. Any schema changes require a new version.

---

## 🏗️ **Versioning Strategy**

### **Event Type Naming Convention**

```
{domain}.{entity}.{action}.v{version}

Examples:
- ecommerce.product.created.v1
- ecommerce.product.created.v2  (if schema changes)
- ecommerce.order.submitted.v1
- ecommerce.payment.processed.v3
```

### **Version Number Rules**

- Start with **v1** for all new events
- Increment version for **any breaking change**
- No semantic versioning (no minor/patch) - just sequential integers
- Version numbers are per event type, not global

---

## ✅ **Non-Breaking Changes (Same Version)**

These changes can be made without incrementing the version:

1. **Adding Optional Fields**

   ```typescript
   // v1 - Original
   interface ProductCreatedV1 {
     productId: string;
     name: string;
     price: number;
   }

   // v1 - Still valid (new optional field)
   interface ProductCreatedV1 {
     productId: string;
     name: string;
     price: number;
     description?: string; // ✅ Optional addition
   }
   ```

2. **Adding New Event Types**
   - Entirely new events don't affect existing ones

3. **Documentation/Comment Changes**
   - Internal documentation updates don't require versioning

---

## ❌ **Breaking Changes (Requires New Version)**

These changes **MUST** increment the version:

1. **Removing Fields**

   ```typescript
   // ❌ NEVER DO THIS
   interface ProductCreatedV1 {
     productId: string;
     name: string;
     // price: number; // Removed - BREAKS v1 consumers
   }

   // ✅ Create v2 instead
   interface ProductCreatedV2 {
     productId: string;
     name: string;
     // price removed in v2
   }
   ```

2. **Changing Field Types**

   ```typescript
   // v1
   price: number;

   // v2 - type change requires new version
   price: string; // ❌ Breaking change
   ```

3. **Renaming Fields**

   ```typescript
   // v1
   productId: string;

   // v2 - field rename requires new version
   id: string; // ❌ Breaking change
   ```

4. **Making Optional Fields Required**

   ```typescript
   // v1
   description?: string;

   // v2 - making required breaks v1 consumers
   description: string; // ❌ Breaking change
   ```

5. **Changing Field Semantics**

   ```typescript
   // v1: price in dollars
   price: number;

   // v2: price in cents - semantic change
   price: number; // ❌ Same type but different meaning
   ```

---

## 🔄 **Migration Strategies**

### **Dual Publishing (Recommended)**

When introducing a new version, publish both old and new events during transition:

```typescript
// Command handler publishes both versions during migration
const events = [
  new ProductCreatedV1({ productId, name, price }),
  new ProductCreatedV2({ productId, name, priceInCents: price * 100 }),
];
```

### **Event Upcasting**

Transform old events to new format when reading:

```typescript
function upcastProductCreated(event: any): ProductCreatedV2 {
  if (event.version === 1) {
    return {
      ...event,
      version: 2,
      priceInCents: event.price * 100,
    };
  }
  return event;
}
```

### **Parallel Projections**

Run projections for both versions during migration:

```typescript
// Projection handles both versions
class ProductProjector {
  handle(event: ProductCreatedV1 | ProductCreatedV2) {
    if (event.type === 'ecommerce.product.created.v1') {
      this.handleV1(event);
    } else if (event.type === 'ecommerce.product.created.v2') {
      this.handleV2(event);
    }
  }
}
```

---

## 📦 **Implementation Guidelines**

### **Event Definitions**

```typescript
// events/product/v1/product-created.v1.ts
export interface ProductCreatedDataV1 {
  productId: string;
  name: string;
  price: number;
  occurredAt: string;
}

// events/product/v2/product-created.v2.ts
export interface ProductCreatedDataV2 {
  productId: string;
  name: string;
  priceInCents: number; // Breaking change: price format
  description: string; // Breaking change: now required
  occurredAt: string;
}
```

### **Event Registration**

```typescript
// Register all versions in event catalog
export const EVENT_CATALOG = {
  'ecommerce.product.created.v1': ProductCreatedV1,
  'ecommerce.product.created.v2': ProductCreatedV2,
  // ... other events
};
```

### **Aggregate Event Emission**

```typescript
class ProductAggregate {
  create(...args) {
    // Emit current version
    this.apply(
      new ProductCreatedV2({
        productId: this.id,
        name,
        priceInCents: price * 100,
        description,
        occurredAt: new Date().toISOString(),
      }),
    );
  }
}
```

---

## 🚨 **Deprecation Process**

### **Phase 1: Dual Support**

- Publish both old and new versions
- Update all consumers to handle new version
- Monitor old version usage

### **Phase 2: Deprecation Warning**

- Log warnings when old version events are processed
- Set deprecation timeline (e.g., 6 months)
- Communicate to all teams

### **Phase 3: Remove Old Version**

- Stop publishing old version events
- Remove old version handling code
- Archive old event definitions

---

## 📊 **Version Tracking**

### **Event Store Metadata**

```json
{
  "eventType": "ecommerce.product.created.v2",
  "eventVersion": 2,
  "schemaVersion": 1,
  "compatibleWithVersions": [1, 2],
  "deprecationDate": null
}
```

### **Monitoring Dashboard**

Track version usage across the system:

- Events published per version
- Consumers still using old versions
- Migration progress metrics

---

## ✅ **Benefits of This Approach**

1. **Zero Downtime Deployments**: Old consumers continue working
2. **Gradual Migration**: Update consumers at their own pace
3. **Rollback Safety**: Can revert to old event versions if needed
4. **Clear History**: Event store maintains complete history
5. **Consumer Choice**: Consumers can choose when to migrate

---

## 🎯 **Quick Reference**

| Change Type            | Version Bump? | Example                                        |
| ---------------------- | ------------- | ---------------------------------------------- |
| Add optional field     | ❌ No         | `description?: string`                         |
| Remove any field       | ✅ Yes        | Remove `category`                              |
| Change field type      | ✅ Yes        | `price: number` → `price: string`              |
| Rename field           | ✅ Yes        | `productId` → `id`                             |
| Make optional required | ✅ Yes        | `description?: string` → `description: string` |
| Change field meaning   | ✅ Yes        | `price` in dollars → cents                     |

**Remember**: When in doubt, increment the version. It's better to be safe than break consumers! 🛡️
