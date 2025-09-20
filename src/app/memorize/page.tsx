import { Button } from "@/components/Button";
import ESVPassagePoll from "@/components/ESVPassagePoll";
import { MemorizationPractice } from "@/components/MemorizationPractice";
import { Container } from "@/components/Container";

const text = "The quick brown fox jumps over the lazy dog.";

export default async function Memorize() {
  return (
    <div className="flex flex-col">
      <Button className="self-start" variant="secondary" href="/">Return Home</Button>
      <Container className="flex flex-col mt-8 sm:mt-16">
      <ESVPassagePoll apiKey={process.env.ESV_API_KEY || ""} />
      <MemorizationPractice text={text} />
      </Container>
    </div>
  );
}
