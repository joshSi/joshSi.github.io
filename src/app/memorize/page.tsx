import { Container } from "@/components/Container";
import { MemorizationPractice } from "@/components/MemorizationPractice";

export default async function Memorize() {
  return (
    <Container className="mt-16 sm:mt-32">
      <MemorizationPractice />
    </Container>
  );
}
