import {
  IList,
  IListMeta,
  IListOption,
  ListOrder,
} from '../pagination.interface';

describe('IList', () => {
  class MetaImpl extends IListMeta {
    page = 1;
    size = 10;
    itemCount = 100;
    pageCount = 10;
    hasPreviousPage = false;
    hasNextPage = true;
  }

  it('constructs with data and meta', () => {
    const meta = new MetaImpl();
    const data = [1, 2, 3];
    // IList is abstract, so we must extend and implement the constructor
    class ConcreteList<T> extends IList<T> {
      constructor(data: T[], meta: IListMeta) {
        super(data, meta);
      }
    }
    const list = new ConcreteList<number>(data, meta);
    expect(list.data).toBe(data);
    expect(list.meta).toBe(meta);
  });
});

describe('IListOption', () => {
  it('defaults order to asc', () => {
    const opt = new IListOption();
    expect(opt.order).toBe(ListOrder.asc);
  });
  it('can set all properties', () => {
    const opt = new IListOption();
    opt.order = ListOrder.desc;
    opt.size = 5;
    opt.page = 2;
    opt.take = 10;
    expect(opt.order).toBe(ListOrder.desc);
    expect(opt.size).toBe(5);
    expect(opt.page).toBe(2);
    expect(opt.take).toBe(10);
  });
});

describe('ListOrder', () => {
  it('has asc and desc values', () => {
    expect(ListOrder.asc).toBe('asc');
    expect(ListOrder.desc).toBe('desc');
  });
});
