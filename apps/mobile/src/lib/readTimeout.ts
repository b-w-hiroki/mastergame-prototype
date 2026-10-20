/** 読取専用。待機を打ち切るが元リクエストの取消や変更処理の再送は行わない。 */
export function withReadTimeout<T>(read: PromiseLike<T>, timeoutMs = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('read timed out')), timeoutMs);
    Promise.resolve(read).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}
