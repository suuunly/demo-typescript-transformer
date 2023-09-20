// -----------------------------------------------------------------------------
// Purpose: Transform entrypoint
// this is the entrypoint that will be called when the transformer is invoked
// to transform an event, the return value of this function will be passed to
// the read model adapter.
// -----------------------------------------------------------------------------
interface Input<T = any> {
  eventId: string;
  validTime: string;
  payload: T;
}

// interface PayloadData {
//   message: string;
// }

// function countUppercaseLetters(str:string) {
//   let count = 0;
//   for (let i = 0; i < str.length; i++) {
//     if (str[i] >= "A" && str[i] <= "Z") {
//       count++;
//     }
//   }
//   return count;
// }

export default async function (input: Input) {
  console.info(`Received event ${input.eventId}, with payload ${JSON.stringify(input.payload)} and valid time ${input.validTime}`);

  // const message = input.payload.message;

  return {
    eventId: input.eventId,
    validTime: input.validTime,
    ...input.payload,
    // upperCaseCount: countUppercaseLetters(message)
  };
}
