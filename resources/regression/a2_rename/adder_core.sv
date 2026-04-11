module adder_core (
    input  logic [7:0] a,
    input  logic [7:0] b,
    output logic [8:0] y
);
    assign y = a + b;
endmodule
