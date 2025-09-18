import { Container } from "@/components/Container";
import { MemorizationPractice } from "@/components/MemorizationPractice";

const text = "The quick brown fox jumps over the lazy dog.";

export default async function Memorize() {
  return (
    <Container className="mt-16 sm:mt-32">
      <MemorizationPractice text={text} />
    </Container>
  );
}
