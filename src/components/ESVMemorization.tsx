"use client";

import { Button } from "@/components/Button";
import ESVPassagePoll from "@/components/ESVPassagePoll";
import { MemorizationPractice } from "@/components/MemorizationPractice";
import { Container } from "@/components/Container";
import { useState } from "react";

export default function Memorize(){
  const [passage, setPassage] = useState<string>('Psalms46:11');

  return (
    <div className="flex flex-col">
      <Button className="self-start" variant="secondary" href="/">Return Home</Button>
      <Container className="flex flex-col mt-8 sm:mt-16">
      <ESVPassagePoll onPassageChange={setPassage} apiKey={process.env.ESV_API_KEY || ""} />
      <div className="flex flex-col mt-4">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
            {passage}
          </h1>
      </div>
      <MemorizationPractice text={passage} />
      </Container>
    </div>
  );
}
